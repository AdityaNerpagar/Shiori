import { cached, HOURS, MINUTES } from "./cache";

const JIKAN = "https://api.jikan.moe/v4";

export interface MalThread {
  title: string;
  url: string;
  comments: number | null;
  date: string | null;
}

async function jikanGet(path: string): Promise<any> {
  const res = await fetch(`${JIKAN}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Jikan request failed: ${res.status}`);
  return res.json();
}

/**
 * Find the MyAnimeList "Episode N Discussion" forum thread via Jikan.
 * No API key needed.
 *
 * Two lookups: the forum endpoint has comment counts but only returns the
 * ~15 most recent topics, so for older episodes we fall back to the
 * paginated episodes endpoint, which carries a forum_url per episode.
 */
export async function getMalEpisodeThread(
  malId: number,
  episode: number
): Promise<MalThread | null> {
  // 1. Recent topics (has comment counts).
  const topics = await cached(`jikan:forum:${malId}`, 30 * MINUTES, async () => {
    const json = await jikanGet(`/anime/${malId}/forum?filter=episode`);
    return (json.data ?? []) as Array<{
      title: string;
      url: string;
      comments: number;
      date: string | null;
    }>;
  });

  const pattern = new RegExp(`episode\\s+${episode}\\s+discussion`, "i");
  const topic = topics.find((t) => pattern.test(t.title));
  if (topic) {
    return {
      title: topic.title,
      url: topic.url,
      comments: topic.comments,
      date: topic.date ?? null,
    };
  }

  // 2. Episodes endpoint (100 per page) — forum_url per episode.
  const page = Math.ceil(episode / 100);
  const episodes = await cached(
    `jikan:episodes:${malId}:${page}`,
    12 * HOURS,
    async () => {
      const json = await jikanGet(`/anime/${malId}/episodes?page=${page}`);
      return (json.data ?? []) as Array<{
        mal_id: number;
        title: string | null;
        forum_url: string | null;
      }>;
    }
  );

  const ep = episodes.find((e) => e.mal_id === episode);
  if (!ep?.forum_url) return null;

  return {
    title: `Episode ${episode} Discussion${ep.title ? ` — ${ep.title}` : ""}`,
    url: ep.forum_url,
    comments: null,
    date: null,
  };
}
