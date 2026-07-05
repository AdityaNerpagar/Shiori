import Anthropic from "@anthropic-ai/sdk";

export interface LLMInfo {
  provider: "anthropic" | "ollama";
  model: string;
}

/**
 * Provider selection: LLM_PROVIDER=anthropic|ollama forces one;
 * "auto" (default) uses Anthropic whenever ANTHROPIC_API_KEY is set,
 * otherwise falls back to local Ollama.
 */
export function resolveLLM(): LLMInfo {
  const forced = (process.env.LLM_PROVIDER ?? "auto").toLowerCase();
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY?.trim();

  const useAnthropic =
    forced === "anthropic" || (forced !== "ollama" && hasAnthropicKey);

  if (useAnthropic) {
    return {
      provider: "anthropic",
      model: process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-4-8",
    };
  }
  return {
    provider: "ollama",
    model: process.env.OLLAMA_MODEL?.trim() || "qwen3.5:27b",
  };
}

const encoder = new TextEncoder();

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function anthropicStream(
  model: string,
  system: string,
  messages: ChatMessage[]
): ReadableStream<Uint8Array> {
  const client = new Anthropic();
  const stream = client.messages.stream({
    model,
    max_tokens: 4096,
    system,
    messages,
  });

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        controller.enqueue(
          encoder.encode(`\n\n[Anthropic error: ${(err as Error).message}]`)
        );
        controller.close();
      }
    },
  });
}

/**
 * Ollama call over node:http rather than fetch: large models on modest
 * hardware can take several minutes before the first token (Ollama only
 * sends response headers with the first chunk), which blows past
 * undici's default 300s headers timeout. node:http has no such timeout,
 * and returning the stream synchronously lets our route send headers to
 * the browser immediately while the model warms up.
 */
function ollamaStream(
  model: string,
  system: string,
  messages: ChatMessage[]
): ReadableStream<Uint8Array> {
  const base = new URL(process.env.OLLAMA_BASE_URL?.trim() || "http://localhost:11434");
  const payload = JSON.stringify({
    model,
    stream: true,
    // Ollama defaults to a 4096-token context, which the episode
    // summaries overflow on deeper episodes — raise it explicitly.
    options: {
      num_ctx: parseInt(process.env.OLLAMA_NUM_CTX ?? "16384", 10),
    },
    messages: [{ role: "system", content: system }, ...messages],
  });

  let req: import("node:http").ClientRequest | null = null;

  return new ReadableStream({
    async start(controller) {
      const http = await import("node:http");

      const fail = (message: string) => {
        controller.enqueue(encoder.encode(`[Ollama error: ${message}]`));
        controller.close();
      };

      req = http.request(
        {
          hostname: base.hostname,
          port: base.port || 11434,
          path: "/api/chat",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (res) => {
          if (res.statusCode !== 200) {
            let body = "";
            res.on("data", (c) => (body += c));
            res.on("end", () =>
              fail(
                `request failed (${res.statusCode}). Is the model pulled? ${body.slice(0, 200)}`
              )
            );
            return;
          }

          // Ollama streams NDJSON: one {message:{content}, done} per line.
          let buffer = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => {
            buffer += chunk;
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const parsed = JSON.parse(line);
                const text = parsed.message?.content;
                if (text) controller.enqueue(encoder.encode(text));
              } catch {
                // ignore partial/garbled lines
              }
            }
          });
          res.on("end", () => controller.close());
          res.on("error", (e) => fail(e.message));
        }
      );

      req.on("error", (e) =>
        fail(`${e.message}. Is Ollama running at ${base.origin}?`)
      );
      req.end(payload);
    },
    cancel() {
      req?.destroy();
    },
  });
}

export function streamAnswer(
  system: string,
  messages: ChatMessage[]
): { info: LLMInfo; stream: ReadableStream<Uint8Array> } {
  const info = resolveLLM();
  const stream =
    info.provider === "anthropic"
      ? anthropicStream(info.model, system, messages)
      : ollamaStream(info.model, system, messages);
  return { info, stream };
}
