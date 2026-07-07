import { cached, DAYS } from "./cache";

const API = "https://en.wikipedia.org/w/api.php";
const USER_AGENT = "Shiori/0.1 (spoiler-safe episode companion; local dev)";

export interface EpisodeSummary {
  /** Canonical overall number — continuous across seasons, 1-based. */
  episode: number;
  /** Season this episode belongs to, when the source reveals it. */
  season: number | null;
  /** Number within its season (can start at 0), when known. */
  inSeason: number | null;
  title: string | null;
  summary: string;
}

export interface SummaryResult {
  source: string | null; // Wikipedia page title the summaries came from
  episodes: EpisodeSummary[];
}

async function wikiGet(params: Record<string, string>): Promise<any> {
  const search = new URLSearchParams({ ...params, format: "json" });
  const res = await fetch(`${API}?${search}`, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Wikipedia request failed: ${res.status}`);
  return res.json();
}

async function searchPages(query: string): Promise<string[]> {
  const json = await wikiGet({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: "6",
  });
  return (json.query?.search ?? []).map((h: { title: string }) => h.title);
}

async function getWikitext(page: string): Promise<string | null> {
  try {
    const json = await wikiGet({
      action: "parse",
      page,
      prop: "wikitext",
      redirects: "1",
    });
    return json.parse?.wikitext?.["*"] ?? null;
  } catch {
    return null;
  }
}

/** Remove {{...}} templates, innermost-first, so nested templates unwind. */
function stripTemplates(s: string): string {
  let prev;
  do {
    prev = s;
    s = s.replace(/\{\{[^{}]*\}\}/g, " ");
  } while (s !== prev);
  return s;
}

function cleanWikitext(s: string): string {
  s = s.replace(/<ref[^>]*\/>/gi, "");
  s = s.replace(/<ref[\s\S]*?<\/ref>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = stripTemplates(s);
  // [[target|label]] -> label, [[target]] -> target
  s = s.replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1");
  s = s.replace(/'''''|'''|''/g, "");
  s = s.replace(/<[^>]+>/g, " ");
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, " ")
    .replace(/&mdash;|&ndash;/g, "—");
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Split a template body on top-level pipes (ignoring pipes nested inside
 * {{...}} and [[...]]), returning `Field = value` parts.
 */
function splitTemplateFields(body: string): string[] {
  const parts: string[] = [];
  let depthCurly = 0;
  let depthSquare = 0;
  let current = "";
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === "{{") {
      depthCurly++;
      current += two;
      i++;
    } else if (two === "}}") {
      depthCurly = Math.max(0, depthCurly - 1);
      current += two;
      i++;
    } else if (two === "[[") {
      depthSquare++;
      current += two;
      i++;
    } else if (two === "]]") {
      depthSquare = Math.max(0, depthSquare - 1);
      current += two;
      i++;
    } else if (body[i] === "|" && depthCurly === 0 && depthSquare === 0) {
      parts.push(current);
      current = "";
    } else {
      current += body[i];
    }
  }
  parts.push(current);
  return parts;
}

const SEASON_IN_TITLE = /\bseason\s+(\d+)\b/i;

/**
 * Season number for each position in the wikitext, read off the section
 * headings ("== Season 2 (2023–2024) ==") that precede the episode tables
 * on combined list pages.
 */
function seasonHeadings(wikitext: string): { pos: number; season: number }[] {
  const marks: { pos: number; season: number }[] = [];
  for (const m of wikitext.matchAll(/^={2,5}\s*(.+?)\s*={2,5}\s*$/gm)) {
    const season = m[1].match(SEASON_IN_TITLE);
    if (season) marks.push({ pos: m.index!, season: parseInt(season[1], 10) });
  }
  return marks;
}

/** Extract every {{Episode list ...}} entry (incl. /sublist) from wikitext. */
function parseEpisodeList(
  wikitext: string,
  seasonHint: number | null = null
): EpisodeSummary[] {
  const episodes: EpisodeSummary[] = [];
  const headings = seasonHint === null ? seasonHeadings(wikitext) : [];
  const re = /\{\{\s*Episode list/gi;
  let match: RegExpExecArray | null;

  while ((match = re.exec(wikitext)) !== null) {
    // Walk braces from the template start to find its matching close.
    let depth = 0;
    let end = -1;
    for (let i = match.index; i < wikitext.length - 1; i++) {
      const two = wikitext.slice(i, i + 2);
      if (two === "{{") {
        depth++;
        i++;
      } else if (two === "}}") {
        depth--;
        i++;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end === -1) continue;

    const body = wikitext.slice(match.index + 2, end - 2);
    const fields: Record<string, string> = {};
    for (const part of splitTemplateFields(body).slice(1)) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      const key = part.slice(0, eq).trim().toLowerCase().replace(/\s+/g, "");
      fields[key] = part.slice(eq + 1).trim();
    }

    const numRaw = fields["episodenumber"] ?? fields["episodenumber2"];
    const summaryRaw = fields["shortsummary"];
    if (!numRaw || !summaryRaw) continue;

    const episode = parseInt(cleanWikitext(numRaw), 10);
    const summary = cleanWikitext(summaryRaw);
    if (!Number.isFinite(episode) || summary.length < 10) continue;

    // EpisodeNumber2 is the within-season number on multi-season lists
    // (EpisodeNumber being the overall one).
    const inSeasonRaw = fields["episodenumber2"]
      ? parseInt(cleanWikitext(fields["episodenumber2"]), 10)
      : NaN;

    let season = seasonHint;
    if (season === null) {
      for (const h of headings) {
        if (h.pos < match.index) season = h.season;
        else break;
      }
    }

    episodes.push({
      episode,
      season,
      inSeason: Number.isFinite(inSeasonRaw) ? inSeasonRaw : null,
      title: fields["title"] ? cleanWikitext(fields["title"]) || null : null,
      summary,
    });
  }
  return episodes;
}

/** Season/sublist pages referenced by a parent episode-list page. */
function findLinkedEpisodePages(wikitext: string): string[] {
  const pages = new Set<string>();
  // Transclusions like {{:List of X episodes (season 1)}} or {{:X season 1}}
  for (const m of wikitext.matchAll(/\{\{\s*:\s*([^{}|]+?)\s*\}\}/g)) {
    if (/episodes|season/i.test(m[1])) pages.add(m[1].trim());
  }
  // {{Main|List of X episodes (season 1)}} style pointers
  for (const m of wikitext.matchAll(/\{\{\s*Main(?:\s*article)?\s*\|([^{}]+)\}\}/gi)) {
    for (const target of m[1].split("|")) {
      // Skip named params like label1=... — they aren't page titles.
      if (target.includes("=")) continue;
      if (/episodes|season/i.test(target)) pages.add(target.trim());
    }
  }
  return [...pages].slice(0, 8);
}

function seasonFromPageTitle(page: string): number | null {
  const m = page.match(SEASON_IN_TITLE);
  return m ? parseInt(m[1], 10) : null;
}

async function episodesFromPage(page: string): Promise<EpisodeSummary[]> {
  const wikitext = await getWikitext(page);
  if (!wikitext) return [];

  const inline = parseEpisodeList(wikitext, seasonFromPageTitle(page));
  const linked = findLinkedEpisodePages(wikitext);

  let fromLinked: EpisodeSummary[] = [];
  for (const sub of linked) {
    const subText = await getWikitext(sub);
    if (subText) {
      fromLinked = fromLinked.concat(
        parseEpisodeList(subText, seasonFromPageTitle(sub))
      );
    }
  }

  // Hub pages transclude per-season pages; inline entries on a hub are
  // usually specials/webisodes. Prefer whichever parse found the real list.
  return fromLinked.length > inline.length ? fromLinked : inline;
}

/**
 * Turn the raw parse (document order, numbering that may restart per
 * season) into a canonical list: `episode` continuous and 1-based across
 * the whole run, seasons inferred from numbering restarts when headings
 * and page titles revealed nothing, deduped and sorted.
 */
function normalizeEpisodes(raw: EpisodeSummary[]): EpisodeSummary[] {
  if (raw.length === 0) return [];

  // Seasons unknown everywhere + numbering restarts ⇒ each restart is a
  // season boundary (per-season pages that only carry in-season numbers).
  const restarts = raw.some((e, i) => i > 0 && e.episode < raw[i - 1].episode);
  if (restarts && raw.every((e) => e.season === null)) {
    let season = 1;
    for (let i = 0; i < raw.length; i++) {
      if (i > 0 && raw[i].episode < raw[i - 1].episode) season++;
      raw[i].season = season;
    }
  }

  // A restart means the parsed numbers were per-season, not overall —
  // keep them as in-season numbers and count overall by position. When
  // there's no restart the numbers are already a continuous overall run
  // (possibly a suffix, if only a later season's page was found).
  const episodes = restarts
    ? raw.map((e, i) => ({
        ...e,
        inSeason: e.inSeason ?? e.episode,
        episode: i + 1,
      }))
    : raw;

  const byNumber = new Map<number, EpisodeSummary>();
  for (const ep of episodes) {
    const existing = byNumber.get(ep.episode);
    // Prefer the longer summary when the same number appears twice.
    if (!existing || ep.summary.length > existing.summary.length) {
      byNumber.set(ep.episode, ep);
    }
  }
  return [...byNumber.values()].sort((a, b) => a.episode - b.episode);
}

/**
 * Find per-episode plot summaries for an anime. Tries the dedicated
 * "List of X episodes" page first, then the main article.
 */
export async function getEpisodeSummaries(
  title: string,
  altTitle?: string | null
): Promise<SummaryResult> {
  const key = `wiki:summaries:v2:${title.toLowerCase()}|${(altTitle ?? "").toLowerCase()}`;
  return cached(key, 2 * DAYS, async () => {
    const candidates = [...new Set([title, altTitle].filter(Boolean))] as string[];

    for (const name of candidates) {
      const hits = await searchPages(`List of ${name} episodes`);
      const listPages = hits.filter((h) => /^list of .*episodes/i.test(h));
      for (const page of listPages.slice(0, 2)) {
        const episodes = normalizeEpisodes(await episodesFromPage(page));
        if (episodes.length > 0) return { source: page, episodes };
      }
    }

    // Fallback: some shows keep the episode table on the main article.
    for (const name of candidates) {
      const hits = await searchPages(name);
      for (const page of hits.slice(0, 2)) {
        const episodes = normalizeEpisodes(await episodesFromPage(page));
        if (episodes.length > 0) return { source: page, episodes };
      }
    }

    return { source: null, episodes: [] };
  });
}
