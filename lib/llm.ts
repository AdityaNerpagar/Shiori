import Anthropic from "@anthropic-ai/sdk";

export interface LLMInfo {
  provider: "gemini" | "anthropic" | "ollama";
  model: string;
}

const GEMINI_DEFAULT_MODEL = "gemini-3.1-flash-lite";
const ANTHROPIC_DEFAULT_MODEL = "claude-opus-4-8";
const OLLAMA_DEFAULT_MODEL = "qwen3.5:27b";

/**
 * Provider selection: LLM_PROVIDER=gemini|anthropic|ollama forces one;
 * "auto" (default) picks by key presence — Gemini (the hosted-site
 * default per the plan), then Anthropic, then local Ollama.
 */
export function resolveLLM(): LLMInfo {
  const forced = (process.env.LLM_PROVIDER ?? "auto").toLowerCase();
  const hasGeminiKey = !!process.env.GEMINI_API_KEY?.trim();
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY?.trim();

  const provider: LLMInfo["provider"] =
    forced === "gemini" || forced === "anthropic" || forced === "ollama"
      ? forced
      : hasGeminiKey
        ? "gemini"
        : hasAnthropicKey
          ? "anthropic"
          : "ollama";

  if (provider === "gemini") {
    return {
      provider,
      model: process.env.GEMINI_MODEL?.trim() || GEMINI_DEFAULT_MODEL,
    };
  }
  if (provider === "anthropic") {
    return {
      provider,
      model: process.env.ANTHROPIC_MODEL?.trim() || ANTHROPIC_DEFAULT_MODEL,
    };
  }
  return {
    provider,
    model: process.env.OLLAMA_MODEL?.trim() || OLLAMA_DEFAULT_MODEL,
  };
}

const encoder = new TextEncoder();

/**
 * Upstream error detail (which can include response bodies) is useful in
 * dev but shouldn't reach anonymous clients in production — log it
 * server-side and send a generic line instead.
 */
function clientErrorText(provider: string, detail: string): string {
  console.error(`${provider} error:`, detail);
  return process.env.NODE_ENV === "production"
    ? `\n\n[The model provider returned an error. Please try again.]`
    : `\n\n[${provider} error: ${detail}]`;
}

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
    max_tokens: 8192,
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
          encoder.encode(clientErrorText("Anthropic", (err as Error).message))
        );
        controller.close();
      }
    },
  });
}

function geminiStream(
  model: string,
  system: string,
  messages: ChatMessage[]
): ReadableStream<Uint8Array> {
  const key = process.env.GEMINI_API_KEY?.trim() ?? "";
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  const payload = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    // Cap output so a hostile prompt can't run up token spend. 8192 clears
    // the worst legitimate case (full-series recap of a long show) with room.
    generationConfig: { maxOutputTokens: 8192 },
    contents: messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
  });

  return new ReadableStream({
    async start(controller) {
      const fail = (message: string) => {
        controller.enqueue(encoder.encode(clientErrorText("Gemini", message)));
        controller.close();
      };

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          },
          body: payload,
        });
        if (!res.ok || !res.body) {
          const body = await res.text().catch(() => "");
          return fail(`request failed (${res.status}). ${body.slice(0, 200)}`);
        }

        // SSE: "data: {json}" lines, text in candidates[].content.parts[].text.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const parts = parsed.candidates?.[0]?.content?.parts ?? [];
              for (const part of parts) {
                if (part.text) controller.enqueue(encoder.encode(part.text));
              }
            } catch {
              // ignore partial/garbled lines
            }
          }
        }
        controller.close();
      } catch (err) {
        fail((err as Error).message);
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
        controller.enqueue(encoder.encode(clientErrorText("Ollama", message)));
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
    info.provider === "gemini"
      ? geminiStream(info.model, system, messages)
      : info.provider === "anthropic"
        ? anthropicStream(info.model, system, messages)
        : ollamaStream(info.model, system, messages);
  return { info, stream };
}
