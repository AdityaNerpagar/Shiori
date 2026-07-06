import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CACHE_DIR = path.join(process.cwd(), ".cache");

/**
 * File-backed cache so we don't hammer AniList/Wikipedia/Jikan while
 * iterating locally. Entries live in .cache/ (gitignored).
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const file = path.join(
    CACHE_DIR,
    createHash("sha1").update(key).digest("hex") + ".json"
  );

  try {
    const raw = JSON.parse(await readFile(file, "utf8")) as {
      expires: number;
      value: T;
    };
    if (raw.expires > Date.now()) return raw.value;
  } catch {
    // miss or corrupt entry — fall through to fetch
  }

  const value = await fetcher();
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(file, JSON.stringify({ expires: Date.now() + ttlMs, value }));
  } catch {
    // read-only filesystem (e.g. serverless) — serve the value uncached
  }
  return value;
}

export const MINUTES = 60 * 1000;
export const HOURS = 60 * MINUTES;
export const DAYS = 24 * HOURS;
