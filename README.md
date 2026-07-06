# Shiori 栞 — Spoiler-Safe Episode Companion

Ask questions about any episodic show you're watching — anime, streaming, broadcast TV — bounded by the episode you're on. The app retrieves per-episode plot summaries (Wikipedia), feeds **only episodes 1..N** to the LLM, and instructs it to answer solely from that — so later-episode information literally never enters the prompt. Plus a per-episode community reaction panel (Reddit + MAL for anime).

See `docs/anime-spoiler-safe-app-plan.md` for the full plan, including the research layer.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## LLM provider

Auto-detected from `.env.local` (priority: Gemini → Anthropic → Ollama):

- **Google Gemini** — the hosted-site default per the plan. Paste a free key from https://aistudio.google.com/apikey into `GEMINI_API_KEY` and it takes over. Model: `GEMINI_MODEL` (default `gemini-2.5-flash`).
- **Anthropic** — takes over when `ANTHROPIC_API_KEY` is set (and no Gemini key). Model: `ANTHROPIC_MODEL` (default `claude-opus-4-8`).
- **Default: Ollama** at `http://localhost:11434` using `OLLAMA_MODEL` (default `qwen3.5:27b`) when no API key is present. Make sure Ollama is running (`ollama serve`) and the model is pulled.
- Force a provider with `LLM_PROVIDER=gemini|anthropic|ollama`.

The badge in the top-right of the UI shows which provider is active. There is deliberately **no user-facing model picker** — the model is config, not a dropdown (plan §6a).

## Show search & content types

- **Anime** resolves via AniList (keyless) — this works out of the box.
- **General TV** (Netflix, HBO, broadcast…) resolves via TMDB and activates automatically once you put a free key in `TMDB_API_KEY` (https://www.themoviedb.org/settings/api — v3 key or v4 token both work). Without it, search is anime-only.
- Search queries both sources in parallel and merges; anime found on TMDB is routed down the anime path.

## Community reactions

- **Reddit** episode-discussion threads activate automatically once you add credentials to `.env.local`:
  1. Go to https://www.reddit.com/prefs/apps → "create another app" → type **script**.
  2. Copy the client ID (under the app name) and secret into `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`.
  3. Restart the dev server.
  - Anime uses r/anime's "Episode N discussion" threads; general TV searches per-show subreddits for "SxxEyy discussion"-style threads (absolute episode numbers are mapped to season/episode via TMDB).
- **MyAnimeList** episode-discussion threads work out of the box for anime (via the free Jikan API — thread link + comment count; MAL's API doesn't expose post bodies).

## How the spoiler boundary works

1. You pick a show (AniList + TMDB search) and the episode you're on.
2. The server fetches the show's Wikipedia "List of … episodes" page and parses every `{{Episode list}}` entry's `ShortSummary` (cached on disk in `.cache/`).
3. On every question, summaries are **filtered to episodes 1..N** before the prompt is built — the model cannot spoil from text it never receives.
4. The system prompt forbids using the model's own knowledge of the show and mandates the "tease safely" behavior when an answer lies ahead.
5. If no summaries exist for a show, the app says so honestly instead of guessing.

## The trace object (research layer, plan §11)

Every query produces a structured trace — query id, episode boundary, exact context sent, snapshot version (a content hash of the retrieved context), model, prompt template version, answer, latency. The consumer UI ignores it; two lite fields surface as response headers (`X-Query-Id`, `X-Snapshot-Version`).

Persistence is **off by default**. Set `TRACE_LOG=1` to append traces as JSONL to `.traces/traces.jsonl` (gitignored) — the seam the eval harness and glass-box mode build on later.

## Notes

- External API responses are cached in `.cache/` (gitignored) — delete it to force refetch.
- Coverage skews toward popular shows; the UI shows a coverage indicator after you select a show.
- Episode numbering is **absolute** throughout (Wikipedia's overall numbering). Season-based mapping only happens when finding TV Reddit threads.
