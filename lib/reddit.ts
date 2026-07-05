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
    const epPattern = new RegExp(`episode\\s+${episode}\\b`, "i");
    const names = [...new Set([title, altTitle].filter(Boolean))] as string[];

    let best: { id: string; title: string; permalink: string; num_comments: number } | null =
      null;

    for (const name of names) {
      const q = encodeURIComponent(`title:"${name}" title:"Episode ${episode}"`);
      const json = await redditGet(
        `/r/anime/search?q=${q}&restrict_sr=1&sort=relevance&limit=10&t=all`
      );
      const posts = (json.data?.children ?? [])
        .map((c: any) => c.data)
        .filter(
          (p: any) =>
            epPattern.test(p.title) && /discussion/i.test(p.title)
        );
      for (const p of posts) {
        if (!best || p.num_comments > best.num_comments) best = p;
      }
      if (best) break;
    }

    if (!best) return null;

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
  });
}
