import type { NextRequest } from "next/server";

/**
 * In-memory per-IP sliding-window rate limiter. Best-effort by design:
 * on Vercel, Fluid Compute reuses function instances across requests, so
 * sustained abuse from one IP hits the same window most of the time, but
 * counts reset when an instance recycles. For hard guarantees, layer a
 * Vercel WAF rate-limit rule on top — this needs no infrastructure.
 */

interface Window {
  /** Request timestamps (ms) still inside some active window. */
  hits: number[];
  lastSeen: number;
}

const windows = new Map<string, Window>();

// Bound memory: beyond this many tracked keys, evict the stalest.
const MAX_KEYS = 10_000;

function evictStalest(): void {
  let oldestKey: string | null = null;
  let oldestSeen = Infinity;
  for (const [key, w] of windows) {
    if (w.lastSeen < oldestSeen) {
      oldestSeen = w.lastSeen;
      oldestKey = key;
    }
  }
  if (oldestKey) windows.delete(oldestKey);
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until a retry could succeed (0 when ok). */
  retryAfterSec: number;
}

export interface RateRule {
  limit: number;
  windowMs: number;
}

/**
 * Record one hit for `key` and check it against every rule (e.g. a burst
 * limit and an hourly limit). Denied requests still count as hits, so
 * hammering while limited never earns a reset.
 */
export function rateLimit(key: string, rules: RateRule[]): RateLimitResult {
  const now = Date.now();
  const maxWindow = Math.max(...rules.map((r) => r.windowMs));

  let w = windows.get(key);
  if (!w) {
    if (windows.size >= MAX_KEYS) evictStalest();
    w = { hits: [], lastSeen: now };
    windows.set(key, w);
  }
  w.lastSeen = now;
  w.hits = w.hits.filter((t) => t > now - maxWindow);
  w.hits.push(now);

  let retryAfterSec = 0;
  for (const rule of rules) {
    const inWindow = w.hits.filter((t) => t > now - rule.windowMs);
    if (inWindow.length > rule.limit) {
      const oldest = inWindow[0];
      retryAfterSec = Math.max(
        retryAfterSec,
        Math.ceil((oldest + rule.windowMs - now) / 1000)
      );
    }
  }
  return { ok: retryAfterSec === 0, retryAfterSec };
}

/** Client IP as Vercel reports it; "unknown" pools unattributed traffic. */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export const ASK_RULES: RateRule[] = [
  { limit: 10, windowMs: 60 * 1000 },
  { limit: 60, windowMs: 60 * 60 * 1000 },
];

export const LOOKUP_RULES: RateRule[] = [{ limit: 30, windowMs: 60 * 1000 }];
