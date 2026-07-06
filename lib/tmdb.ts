import { cached, HOURS } from "./cache";

const TMDB = "https://api.themoviedb.org/3";

export interface TmdbShow {
  id: number;
  name: string;
  originalName: string | null;
  year: number | null;
  episodes: number | null;
  image: string | null;
  /** Best-effort: Japanese animation on TMDB is almost certainly also on AniList. */
  looksLikeAnime: boolean;
  seasons: TmdbSeason[];
}

export interface TmdbSeason {
  seasonNumber: number;
  episodeCount: number;
}

function apiKey(): string | null {
  return process.env.TMDB_API_KEY?.trim() || null;
}

/** TMDB activates automatically when TMDB_API_KEY appears in .env.local. */
export function tmdbEnabled(): boolean {
  return apiKey() !== null;
}

async function tmdbGet(pathname: string, params: Record<string, string> = {}): Promise<any> {
  const key = apiKey();
  if (!key) throw new Error("TMDB_API_KEY not configured");

  const search = new URLSearchParams(params);
  const headers: Record<string, string> = { Accept: "application/json" };
  // v4 read-access tokens are JWTs and go in the header; v3 keys go in the query.
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  else search.set("api_key", key);

  const res = await fetch(`${TMDB}${pathname}?${search}`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`TMDB request failed: ${res.status}`);
  return res.json();
}

const ANIMATION_GENRE = 16;

interface TmdbSearchHit {
  id: number;
  name: string;
  original_name: string | null;
  first_air_date: string | null;
  poster_path: string | null;
  genre_ids: number[];
  original_language: string | null;
}

async function tvDetails(id: number): Promise<{
  episodes: number | null;
  seasons: TmdbSeason[];
}> {
  return cached(`tmdb:tv:${id}`, 12 * HOURS, async () => {
    const json = await tmdbGet(`/tv/${id}`);
    return {
      episodes: (json.number_of_episodes as number) || null,
      seasons: ((json.seasons ?? []) as any[])
        .filter((s) => s.season_number > 0 && s.episode_count > 0)
        .map((s) => ({
          seasonNumber: s.season_number as number,
          episodeCount: s.episode_count as number,
        }))
        .sort((a, b) => a.seasonNumber - b.seasonNumber),
    };
  });
}

export async function searchTv(query: string): Promise<TmdbShow[]> {
  if (!tmdbEnabled()) return [];

  return cached(`tmdb:search:${query.toLowerCase()}`, 12 * HOURS, async () => {
    const json = await tmdbGet("/search/tv", {
      query,
      include_adult: "false",
    });
    const hits = ((json.results ?? []) as TmdbSearchHit[]).slice(0, 5);

    // Search results carry no episode counts — pull details in parallel (cached).
    const details = await Promise.allSettled(hits.map((h) => tvDetails(h.id)));

    return hits.map((h, i) => {
      const d = details[i].status === "fulfilled" ? details[i].value : null;
      return {
        id: h.id,
        name: h.name,
        originalName: h.original_name ?? null,
        year: h.first_air_date ? parseInt(h.first_air_date.slice(0, 4), 10) || null : null,
        episodes: d?.episodes ?? null,
        image: h.poster_path ? `https://image.tmdb.org/t/p/w154${h.poster_path}` : null,
        looksLikeAnime:
          h.original_language === "ja" && h.genre_ids.includes(ANIMATION_GENRE),
        seasons: d?.seasons ?? [],
      };
    });
  });
}

/**
 * Map an absolute episode number to (season, episode-in-season) using the
 * show's season structure — the numbering the app uses is absolute, but
 * TV communities discuss episodes as SxxEyy.
 */
export async function absoluteToSeasonEpisode(
  tmdbId: number,
  absolute: number
): Promise<{ season: number; episode: number } | null> {
  const { seasons } = await tvDetails(tmdbId);
  let remaining = absolute;
  for (const s of seasons) {
    if (remaining <= s.episodeCount) {
      return { season: s.seasonNumber, episode: remaining };
    }
    remaining -= s.episodeCount;
  }
  return null;
}
