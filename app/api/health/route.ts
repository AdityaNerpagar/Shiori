import { NextResponse } from "next/server";
import { resolveLLM } from "@/lib/llm";
import { redditEnabled } from "@/lib/reddit";

export async function GET() {
  return NextResponse.json({
    llm: resolveLLM(),
    redditEnabled: redditEnabled(),
  });
}
