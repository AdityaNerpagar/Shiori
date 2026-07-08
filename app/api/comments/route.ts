import { NextRequest, NextResponse } from "next/server";
import { getMalEpisodeThread } from "@/lib/jikan";
import {
  getRedditEpisodeThread,
  getRedditTvEpisodeThread,
  redditEnabled,
} from "@/lib/reddit";
import { absoluteToSeasonEpisode } from "@/lib/tmdb";
import { LOOKUP_RULES, clientIp, rateLimit } from "@/lib/ratelimit";

/**
 * Thread links come from third-party APIs and end up as <a href> in the
 * UI — only pass through https links on the hosts they're supposed to
 * point at.
 */
function safeThreadUrl(url: unknown, hosts: string[]): string | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    return hosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))
      ? url
      : null;
  } catch {
    return null;
  }
}

function sanitizeThread<T extends { url: string }>(
  thread: T | null,
  hosts: string[]
): T | null {
  if (!thread) return null;
  const url = safeThreadUrl(thread.url, hosts);
  return url ? { ...thread, url } : null;
}

export async function GET(req: NextRequest) {
  const limited = rateLimit(`comments:${clientIp(req)}`, LOOKUP_RULES);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests — please slow down." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    );
  }

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
    mal:
      malResult.status === "fulfilled"
        ? sanitizeThread(malResult.value, ["myanimelist.net"])
        : null,
    malError:
      malResult.status === "rejected" ? (malResult.reason as Error).message : null,
    malApplicable: contentType === "anime",
    reddit:
      redditResult.status === "fulfilled"
        ? sanitizeThread(redditResult.value, ["reddit.com"])
        : null,
    redditError:
      redditResult.status === "rejected"
        ? (redditResult.reason as Error).message
        : null,
    redditEnabled: redditEnabled(),
  });
}
