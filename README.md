# Shiori 栞 — Spoiler-Safe Anime Companion

Ask questions about the anime you're watching, bounded by the episode you're on. The app retrieves per-episode plot summaries (Wikipedia), feeds **only episodes 1..N** to the LLM, and instructs it to answer solely from that — so later-episode information literally never enters the prompt. Plus a per-episode community reaction panel (MAL + Reddit).

See `docs/anime-spoiler-safe-app-plan.md` for the full plan.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## LLM provider

Auto-detected from `.env.local`:

- **Default: Ollama** at `http://localhost:11434` using `OLLAMA_MODEL` (default `qwen3.5:27b`). Make sure Ollama is running (`ollama serve`) and the model is pulled.
- **Anthropic takes over automatically** the moment you paste a key into `ANTHROPIC_API_KEY` and restart the dev server. Model: `ANTHROPIC_MODEL` (default `claude-opus-4-8`).
- Force a provider with `LLM_PROVIDER=ollama` or `LLM_PROVIDER=anthropic`.

The badge in the top-right of the UI shows which provider is active.

## Community reactions

- **MyAnimeList** episode-discussion threads work out of the box (via the free Jikan API — thread link + comment count; MAL's API doesn't expose post bodies).
- **Reddit r/anime** episode-discussion threads (with top comments shown inline) activate automatically once you add credentials to `.env.local`:
  1. Go to https://www.reddit.com/prefs/apps → "create another app" → type **script**.
  2. Copy the client ID (under the app name) and secret into `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`.
  3. Restart the dev server.

## How the spoiler boundary works

1. You pick an anime (AniList search) and the episode you're on.
2. The server fetches the show's Wikipedia "List of … episodes" page and parses every `{{Episode list}}` entry's `ShortSummary` (cached on disk in `.cache/`).
3. On every question, summaries are **filtered to episodes 1..N** before the prompt is built — the model cannot spoil from text it never receives.
4. The system prompt forbids using the model's own knowledge of the show and mandates the "tease safely" behavior when an answer lies ahead.
5. If no summaries exist for a show, the app says so honestly instead of guessing.

## Notes

- External API responses are cached in `.cache/` (gitignored) — delete it to force refetch.
- Coverage skews toward popular shows; the UI shows a coverage indicator after you select an anime.
