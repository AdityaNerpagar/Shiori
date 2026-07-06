import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * The trace object — one structured record per query (plan §11).
 * The consumer UI ignores it; the research surface renders it; the
 * logging layer optionally persists it. Consent-gated and OFF by
 * default: nothing is written unless TRACE_LOG=1.
 */

export const PROMPT_TEMPLATE_VERSION = "v1";

export type ContentType = "anime" | "tv" | "unknown";

export interface QueryTrace {
  query_id: string;
  timestamp: string;
  resolved_title: string;
  content_type: ContentType;
  episode_boundary: number;
  retrieval: {
    source: string | null;
    episodes_fetched: number[];
    /** Content hash of the exact context — identical context ⇒ identical version. */
    snapshot_version: string;
    char_count: number;
  };
  /** The exact text handed to the model as grounding. */
  context_sent: string;
  prompt_template_version: string;
  model: { provider: string; name: string };
  question: string;
  output: { raw_answer: string | null };
  latency_ms: number | null;
}

/** Deterministic version for a retrieved-context snapshot (R1). */
export function snapshotVersion(context: string): string {
  return createHash("sha1").update(context).digest("hex").slice(0, 12);
}

export function newTrace(
  fields: Omit<QueryTrace, "query_id" | "timestamp" | "prompt_template_version">
): QueryTrace {
  return {
    query_id: randomUUID(),
    timestamp: new Date().toISOString(),
    prompt_template_version: PROMPT_TEMPLATE_VERSION,
    ...fields,
  };
}

export function traceLoggingEnabled(): boolean {
  return process.env.TRACE_LOG?.trim() === "1";
}

const TRACE_DIR = path.join(process.cwd(), ".traces");

export async function persistTrace(trace: QueryTrace): Promise<void> {
  if (!traceLoggingEnabled()) return;
  try {
    await mkdir(TRACE_DIR, { recursive: true });
    await appendFile(
      path.join(TRACE_DIR, "traces.jsonl"),
      JSON.stringify(trace) + "\n"
    );
  } catch {
    // Tracing must never break the consumer path.
  }
}

/**
 * Wrap the model's output stream so the finished answer and latency are
 * folded back into the trace when the stream closes, then persisted
 * (if TRACE_LOG=1). Pass-through for the client either way.
 */
export function traceStream(
  stream: ReadableStream<Uint8Array>,
  trace: QueryTrace,
  startedAt: number
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let answer = "";
  return stream.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        answer += decoder.decode(chunk, { stream: true });
        controller.enqueue(chunk);
      },
      async flush() {
        trace.output.raw_answer = answer;
        trace.latency_ms = Date.now() - startedAt;
        await persistTrace(trace);
      },
    })
  );
}
