import { NextRequest, NextResponse } from "next/server";
import { getMalEpisodeThread } from "@/lib/jikan";
import {
  getRedditEpisodeThread,
  getRedditTvEpisodeThread,
  redditEnabled,
} from "@/lib/reddit";
import { absoluteToSeasonEpisode } from "@/lib/tmdb";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const malId = parseInt(params.get("malId") ?? "", 10);
  const tmdbId = parseInt(params.get("tmdbId") ?? "", 10);
  const episode = parseInt(params.get("episode") ?? "", 10);
  const title = params.get("title")?.trim();
  const altTitle = params.get("altTitle")?.trim() || null;
  const contentType = params.get("contentType") === "tv" ? "tv" : "anime";

  if (!Number.isFinite(episode) || episode < 1 || !title) {
    return NextResponse.json(
      { error: "title and episode are required" },
      { status: 400 }
    );
  }

  const redditPromise =
    contentType === "tv"
      ? (async () => {
          // TV communities talk in SxxEyy — map our absolute number first.
          const se = Number.isFinite(tmdbId)
            ? await absoluteToSeasonEpisode(tmdbId, episode).catch(() => null)
            : null;
          return getRedditTvEpisodeThread(title, se, episode);
        })()
      : getRedditEpisodeThread(title, altTitle, episode);

  const [malResult, redditResult] = await Promise.allSettled([
    contentType === "anime" && Number.isFinite(malId)
      ? getMalEpisodeThread(malId, episode)
      : Promise.resolve(null),
    redditPromise,
  ]);

  return NextResponse.json({
    mal: malResult.status === "fulfilled" ? malResult.value : null,
    malError:
      malResult.status === "rejected" ? (malResult.reason as Error).message : null,
    malApplicable: contentType === "anime",
    reddit: redditResult.status === "fulfilled" ? redditResult.value : null,
    redditError:
      redditResult.status === "rejected"
        ? (redditResult.reason as Error).message
        : null,
    redditEnabled: redditEnabled(),
  });
}
