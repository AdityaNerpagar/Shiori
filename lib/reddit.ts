import { cached, MINUTES } from "./cache";

export interface RedditComment {
  author: string;
  score: number;
  body: string;
}

export interface RedditThread {
  title: string;
  url: string;
  numComments: number;
  comments: RedditComment[];
}

function credentials() {
  const id = process.env.REDDIT_CLIENT_ID?.trim();
  const secret = process.env.REDDIT_CLIENT_SECRET?.trim();
  if (!id || !secret) return null;
  return {
    id,
    secret,
    userAgent: process.env.REDDIT_USER_AGENT?.trim() || "shiori-local/0.1",
  };
}

/** Reddit activates automatically when credentials appear in .env.local. */
export function redditEnabled(): boolean {
  return credentials() !== null;
}

async function getToken(): Promise<string> {
  const creds = credentials();
  if (!creds) throw new Error("Reddit credentials not configured");

  return cached("reddit:token", 50 * MINUTES, async () => {
    const auth = Buffer.from(`${creds.id}:${creds.secret}`).toString("base64");
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": creds.userAgent,
      },
      body: "grant_type=client_credentials",
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Reddit auth failed: ${res.status}`);
    const json = await res.json();
    if (!json.access_token) throw new Error("Reddit auth returned no token");
    return json.access_token as string;
  });
}

async function redditGet(pathAndQuery: string): Promise<any> {
  const creds = credentials()!;
  const token = await getToken();
  const res = await fetch(`https://oauth.reddit.com${pathAndQuery}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": creds.userAgent,
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Reddit request failed: ${res.status}`);
  return res.json();
}

interface RedditPost {
  id: string;
  title: string;
  permalink: string;
  num_comments: number;
}

async function searchPosts(
  query: string,
  pathPrefix: string,
  restrictSr: boolean
): Promise<RedditPost[]> {
  const q = encodeURIComponent(query);
  const json = await redditGet(
    `${pathPrefix}/search?q=${q}${restrictSr ? "&restrict_sr=1" : ""}&sort=relevance&limit=25&t=all&raw_json=1`
  );
  return (json.data?.children ?? []).map((c: any) => c.data as RedditPost);
}

async function threadWithComments(best: RedditPost): Promise<RedditThread> {
  const thread = await redditGet(
    `/comments/${best.id}?depth=1&limit=25&sort=top&raw_json=1`
  );
  const comments: RedditComment[] = (thread[1]?.data?.children ?? [])
    .map((c: any) => c.data)
    .filter(
      (c: any) =>
        c?.body &&
        !c.stickied &&
        c.author !== "AutoModerator" &&
        c.author !== "[deleted]"
    )
    .slice(0, 15)
    .map((c: any) => ({
      author: c.author as string,
      score: c.score as number,
      body: (c.body as string).slice(0, 1500),
    }));

  return {
    title: best.title,
    url: `https://www.reddit.com${best.permalink}`,
    numComments: best.num_comments,
    comments,
  };
}

function pickBest(posts: RedditPost[], patterns: RegExp[]): RedditPost | null {
  let best: RedditPost | null = null;
  for (const p of posts) {
    if (!/discussion/i.test(p.title)) continue;
    if (!patterns.some((re) => re.test(p.title))) continue;
    if (!best || p.num_comments > best.num_comments) best = p;
  }
  return best;
}

/**
 * Find the r/anime episode-discussion thread for this show + episode and
 * return its top comments. Titles follow the pattern
 * "<Show> - Episode <N> discussion".
 */
export async function getRedditEpisodeThread(
  title: string,
  altTitle: string | null,
  episode: number
): Promise<RedditThread | null> {
  if (!redditEnabled()) return null;

  const key = `reddit:thread:${title.toLowerCase()}:${episode}`;
  return cached(key, 30 * MINUTES, async () => {
    const patterns = [new RegExp(`episode\\s+${episode}\\b`, "i")];
    const names = [...new Set([title, altTitle].filter(Boolean))] as string[];

    for (const name of names) {
      const posts = await searchPosts(
        `title:"${name}" title:"Episode ${episode}"`,
        "/r/anime",
        true
      );
      const best = pickBest(posts, patterns);
      if (best) return threadWithComments(best);
    }
    return null;
  });
}

/**
 * Find a general-TV episode-discussion thread. TV subreddits title these
 * as "SxxEyy", "1x05", "Season 1 Episode 5", or plain "Episode N" for
 * single-season shows — search sitewide and match any of those, since the
 * subreddit name isn't knowable up front (r/TheBear, r/BreakingBad, …).
 */
export async function getRedditTvEpisodeThread(
  title: string,
  seasonEpisode: { season: number; episode: number } | null,
  absoluteEpisode: number
): Promise<RedditThread | null> {
  if (!redditEnabled()) return null;

  const se = seasonEpisode;
  const key = `reddit:tvthread:${title.toLowerCase()}:${se ? `s${se.season}e${se.episode}` : absoluteEpisode}`;
  return cached(key, 30 * MINUTES, async () => {
    const patterns: RegExp[] = [];
    const queries: string[] = [];

    if (se) {
      const sxxeyy = `S${String(se.season).padStart(2, "0")}E${String(se.episode).padStart(2, "0")}`;
      patterns.push(
        new RegExp(`s0?${se.season}\\s*[ex]\\s*0?${se.episode}\\b`, "i"),
        new RegExp(`season\\s+${se.season}\\b.*episode\\s+${se.episode}\\b`, "i")
      );
      queries.push(`title:"${title}" title:"${sxxeyy}"`);
      // Single-season shows often skip the season marker entirely.
      if (se.season === 1) {
        patterns.push(new RegExp(`episode\\s+${se.episode}\\b`, "i"));
      }
    } else {
      patterns.push(new RegExp(`episode\\s+${absoluteEpisode}\\b`, "i"));
    }
    queries.push(`title:"${title}" title:"discussion"`);

    for (const q of queries) {
      const posts = await searchPosts(q, "", false);
      const best = pickBest(posts, patterns);
      if (best) return threadWithComments(best);
    }
    return null;
  });
}
