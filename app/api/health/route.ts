import { NextResponse } from "next/server";
import { resolveLLM } from "@/lib/llm";
import { redditEnabled } from "@/lib/reddit";
import { tmdbEnabled } from "@/lib/tmdb";
import { traceLoggingEnabled } from "@/lib/trace";

export async function GET() {
  return NextResponse.json({
    llm: resolveLLM(),
    redditEnabled: redditEnabled(),
    tmdbEnabled: tmdbEnabled(),
    traceLogging: traceLoggingEnabled(),
  });
}
