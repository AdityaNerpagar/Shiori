import { searchAnime } from "./anilist";
import { searchTv, tmdbEnabled } from "./tmdb";

/**
 * Unified show model over both metadata sources (plan §4/§8):
 * anime routes to AniList (keeps malId for MAL comments), everything
 * else to TMDB. Search runs both and merges.
 */
export interface ShowResult {
  id: string; // "anilist:123" | "tmdb:456"
  source: "anilist" | "tmdb";
  contentType: "anime" | "tv";
  anilistId: number | null;
  malId: number | null;
  tmdbId: number | null;
  title: string;
  altTitle: string | null;
  episodes: number | null;
  year: number | null;
  format: string | null;
  image: string | null;
  /** Season structure (TMDB only) — absolute episode numbering maps onto this. */
  seasons: { seasonNumber: number; episodeCount: number }[] | null;
}

function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export async function searchShows(query: string): Promise<ShowResult[]> {
  const [anilist, tmdb] = await Promise.allSettled([
    searchAnime(query),
    searchTv(query),
  ]);

  const fromAnilist: ShowResult[] =
    anilist.status === "fulfilled"
      ? anilist.value.map((a) => ({
          id: `anilist:${a.id}`,
          source: "anilist" as const,
          contentType: "anime" as const,
          anilistId: a.id,
          malId: a.idMal,
          tmdbId: null,
          title: a.title.english || a.title.romaji || "Unknown",
          altTitle:
            a.title.english && a.title.romaji ? a.title.romaji : null,
          episodes: a.episodes,
          year: a.seasonYear,
          format: a.format,
          image: a.coverImage.medium,
          // Anime seasons live as separate AniList entries — no season layer.
          seasons: null,
        }))
      : [];

  const fromTmdb: ShowResult[] =
    tmdb.status === "fulfilled"
      ? tmdb.value.map((t) => ({
          id: `tmdb:${t.id}`,
          source: "tmdb" as const,
          // Edge case from the plan: anime that surfaces on TMDB. Route it
          // as anime so grounding/comments use the anime-tuned paths.
          contentType: t.looksLikeAnime ? ("anime" as const) : ("tv" as const),
          anilistId: null,
          malId: null,
          tmdbId: t.id,
          title: t.name,
          altTitle:
            t.originalName && t.originalName !== t.name ? t.originalName : null,
          episodes: t.episodes,
          year: t.year,
          format: "TV",
          image: t.image,
          seasons: t.seasons?.length ? t.seasons : null,
        }))
      : [];

  // Merge: interleave the two relevance-ordered lists, dropping duplicate
  // titles. AniList goes first on collisions — it carries the malId.
  const seen = new Set<string>();
  const merged: ShowResult[] = [];
  const max = Math.max(fromAnilist.length, fromTmdb.length);
  for (let i = 0; i < max; i++) {
    for (const candidate of [fromAnilist[i], fromTmdb[i]]) {
      if (!candidate) continue;
      const key = normalizeTitle(candidate.title);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(candidate);
    }
  }
  return merged.slice(0, 8);
}

export { tmdbEnabled };
