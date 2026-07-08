import { NextRequest, NextResponse } from "next/server";
import { searchShows } from "@/lib/shows";
import { LOOKUP_RULES, clientIp, rateLimit } from "@/lib/ratelimit";

export async function GET(req: NextRequest) {
  const limited = rateLimit(`search:${clientIp(req)}`, LOOKUP_RULES);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests — please slow down." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    );
  }

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  try {
    const results = await searchShows(q);
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 }
    );
  }
}
