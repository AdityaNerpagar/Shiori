import { NextRequest, NextResponse } from "next/server";
import { getEpisodeSummaries } from "@/lib/wikipedia";

/**
 * Reports how many episode summaries we can ground answers on, so the UI
 * can warn about thin coverage before the user asks anything.
 */
export async function GET(req: NextRequest) {
  const title = req.nextUrl.searchParams.get("title")?.trim();
  const altTitle = req.nextUrl.searchParams.get("altTitle")?.trim() || null;
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  try {
    const { source, episodes } = await getEpisodeSummaries(title, altTitle);
    return NextResponse.json({
      source,
      total: episodes.length,
      maxEpisode: episodes.length
        ? Math.max(...episodes.map((e) => e.episode))
        : 0,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 }
    );
  }
}
