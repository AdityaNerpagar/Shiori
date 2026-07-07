# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Shiori 栞 — a spoiler-safe episode companion. The user picks a show and the episode they're on; answers are grounded ONLY on Wikipedia per-episode summaries up to that episode, delivered in a selectable companion voice. Full product/research plan: `docs/anime-spoiler-safe-app-plan.md`.

## Commands

```bash
npm run dev          # dev server (Next.js 16, App Router)
npm run build        # production build
npx tsc --noEmit     # typecheck — there is no lint or test setup; this is the check to run
```

There are no automated tests. Verify changes end-to-end by running the dev server and curling the API; set `TRACE_LOG=1` to persist per-query traces to `.traces/traces.jsonl`, whose `context_sent` field shows the exact grounding text the model received (the way to confirm the spoiler boundary):

```bash
curl -s -D - -X POST localhost:3000/api/ask -H 'Content-Type: application/json' \
  -d '{"title":"...","contentType":"anime","anilistId":123,"episode":8,"question":"recap"}'
# X-Summaries-Used header = how many episode notes were in bounds
```

External API responses cache to `.cache/` (file-backed, gitignored) — delete it to force refetch. If you change a cached data shape, bump the cache key version (e.g. `wiki:summaries:v2`) instead of relying on TTL expiry.

## Architecture

Single Next.js app: one client page (`app/page.tsx`) + API routes (`app/api/{search,coverage,ask,comments,health}`). All domain logic lives in `lib/`.

**Question flow (`/api/ask`):** `page.tsx` sends `{title, altTitle, contentType, anilistId?, episode, persona, question, history}` → route fetches Wikipedia summaries (`lib/wikipedia.ts`) and, for anime, the entry's absolute-episode offset (`lib/anilist.ts`) in parallel → `boundEpisodes()` computes the spoiler boundary → system prompt = spoiler rules + persona voice → `lib/llm.ts` streams the answer → `lib/trace.ts` wraps the stream to record the full trace.

**Episode numbering is the load-bearing subtlety.** Three numbering universes must be reconciled:
- Wikipedia episode lists number continuously across seasons (`EpisodeNumber` overall, `EpisodeNumber2` within-season). `lib/wikipedia.ts` normalizes everything to a canonical continuous `episode` plus optional `season`/`inSeason` (season inferred from sub-page titles, section headings, or numbering restarts).
- AniList splits anime per season AND per cour ("Season 2 Part 2" is its own entry), so the user's episode number is per-entry. `getAbsoluteEpisodeOffset()` walks the AniList PREQUEL relation chain, summing TV/ONA episode counts, to place the entry in the continuous numbering. Returns null when the chain is unreliable → `boundEpisodes()` falls back to title-parsed "Season N" + wiki season annotations, then to treating the number as absolute.
- TMDB shows use absolute numbering end-to-end; seasons are a pure UI view (`seasonStarts` in page.tsx). Reddit thread lookup maps absolute → SxxEyy via `absoluteToSeasonEpisode()`.

**The spoiler boundary is sacred.** Only episodes ≤ the computed boundary may ever reach the model; when mapping is uncertain, prefer under-including (safe) over over-including (leak). The `singleLaterSeason` guard in `app/api/ask/route.ts` exists because applying an absolute offset to a wiki page that only covers a later season would blow past the boundary.

**LLM providers (`lib/llm.ts`):** auto-picked by key presence — Gemini → Anthropic → Ollama; force with `LLM_PROVIDER`. All three return a `ReadableStream<Uint8Array>` of plain text. Ollama deliberately uses `node:http` instead of fetch (undici's headers timeout kills slow local models). No user-facing model picker, by design.

**Personas (`lib/personas.ts`):** the client sends only a persona id; the server resolves it to a voice block (unknown ids fall back to Shiori) — never accept prompt text from the client. The voice section sits below the spoiler rules in the system prompt and explicitly defers to them. Persona picker state persists in localStorage (`shiori:persona`).

**Trace layer (`lib/trace.ts`):** every query builds a trace (exact context, snapshot hash, persona, model, latency); persistence only when `TRACE_LOG=1`. Bump `PROMPT_TEMPLATE_VERSION` whenever the system prompt template changes. The consumer path must never depend on research features.

**Serverless constraint:** deployed on Vercel (auto-deploys from `main`, project "shiori"). The filesystem is read-only there, so `lib/cache.ts` writes are best-effort — code must work when every cache write fails. Env vars set in Vercel override code defaults (notably `GEMINI_MODEL`).

## Conventions

- Env config is documented in `.env.example`; local secrets in `.env.local` (gitignored). Gemini model default is `gemini-3.1-flash-lite` with backup models listed in `.env.example`.
- Do not add Co-Authored-By or similar trailers to commits.
- Companion art prompts and asset naming: `docs/persona-art-prompts.md` (images go in `public/personas/`).
