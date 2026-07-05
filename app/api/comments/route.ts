import { NextRequest, NextResponse } from "next/server";
import { getMalEpisodeThread } from "@/lib/jikan";
import { getRedditEpisodeThread, redditEnabled } from "@/lib/reddit";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const malId = parseInt(params.get("malId") ?? "", 10);
  const episode = parseInt(params.get("episode") ?? "", 10);
  const title = params.get("title")?.trim();
  const altTitle = params.get("altTitle")?.trim() || null;

  if (!Number.isFinite(episode) || episode < 1 || !title) {
    return NextResponse.json(
      { error: "title and episode are required" },
      { status: 400 }
    );
  }

  const [malResult, redditResult] = await Promise.allSettled([
    Number.isFinite(malId)
      ? getMalEpisodeThread(malId, episode)
      : Promise.resolve(null),
    getRedditEpisodeThread(title, altTitle, episode),
  ]);

  return NextResponse.json({
    mal: malResult.status === "fulfilled" ? malResult.value : null,
    malError:
      malResult.status === "rejected" ? (malResult.reason as Error).message : null,
    reddit: redditResult.status === "fulfilled" ? redditResult.value : null,
    redditError:
      redditResult.status === "rejected"
        ? (redditResult.reason as Error).message
        : null,
    redditEnabled: redditEnabled(),
  });
}
