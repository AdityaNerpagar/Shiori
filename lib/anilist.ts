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
