import { cached, HOURS } from "./cache";

const ANILIST_URL = "https://graphql.anilist.co";

export interface AnimeResult {
  id: number;
  idMal: number | null;
  episodes: number | null;
  status: string | null;
  format: string | null;
  seasonYear: number | null;
  title: { romaji: string | null; english: string | null };
  coverImage: { medium: string | null };
}

const MEDIA_FIELDS = `
  id
  idMal
  episodes
  status
  format
  seasonYear
  title { romaji english }
  coverImage { medium }
`;

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`AniList request failed: ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(`AniList error: ${json.errors[0].message}`);
  return json.data as T;
}

export async function searchAnime(query: string): Promise<AnimeResult[]> {
  return cached(`anilist:search:${query.toLowerCase()}`, 12 * HOURS, async () => {
    const data = await gql<{ Page: { media: AnimeResult[] } }>(
      `query ($q: String) {
        Page(perPage: 8) {
          media(search: $q, type: ANIME, isAdult: false) { ${MEDIA_FIELDS} }
        }
      }`,
      { q: query }
    );
    return data.Page.media;
  });
}

/** Formats that occupy a slot in a series' continuous episode numbering. */
const COUNTED_FORMATS = new Set(["TV", "TV_SHORT", "ONA"]);

interface PrequelInfo {
  prequels: { id: number; episodes: number | null; format: string | null }[];
}

async function mediaPrequels(id: number): Promise<PrequelInfo> {
  return cached(`anilist:prequels:${id}`, 2 * 24 * HOURS, async () => {
    const data = await gql<{
      Media: {
        relations: {
          edges: {
            relationType: string;
            node: { id: number; episodes: number | null; format: string | null };
          }[];
        } | null;
      };
    }>(
      `query ($id: Int) {
        Media(id: $id, type: ANIME) {
          relations {
            edges { relationType node { id episodes format } }
          }
        }
      }`,
      { id }
    );
    return {
      prequels: (data.Media.relations?.edges ?? [])
        .filter((e) => e.relationType === "PREQUEL")
        .map((e) => e.node),
    };
  });
}

/**
 * How many episodes precede this entry in the series' continuous
 * numbering (the numbering Wikipedia episode lists use). AniList splits
 * seasons — and even cours within a season — into separate entries
 * chained by PREQUEL relations, so walking that chain and summing
 * episode counts of TV-format prequels gives the exact offset:
 * "Season 2 Part 2" of a show with an 11+12 season 1 and a 13-episode
 * part 1 offsets by 36. Returns null when the chain can't be trusted
 * (missing relation data or an unaired prequel without a count).
 */
export async function getAbsoluteEpisodeOffset(
  anilistId: number
): Promise<number | null> {
  try {
    let offset = 0;
    const visited = new Set<number>([anilistId]);
    let current = anilistId;

    for (let hop = 0; hop < 20; hop++) {
      const { prequels } = await mediaPrequels(current);
      if (prequels.length === 0) return offset;

      // Prefer the mainline TV prequel; movies/OVAs on the chain are
      // walked through but don't occupy numbering slots.
      const next =
        prequels.find((p) => COUNTED_FORMATS.has(p.format ?? "")) ?? prequels[0];
      if (visited.has(next.id)) return offset;
      visited.add(next.id);

      if (COUNTED_FORMATS.has(next.format ?? "")) {
        if (!next.episodes) return null; // still airing — count unknown
        offset += next.episodes;
      }
      current = next.id;
    }
    return offset;
  } catch {
    return null;
  }
}
