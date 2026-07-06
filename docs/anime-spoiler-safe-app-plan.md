# Spoiler-Safe Episode Companion — Feasibility & Build Plan

*A web app that answers questions about any episodic video content you're watching, bounded by the episode you're on — so you never get spoiled. Plus a per-episode community reaction feed.*

**Guiding principle:** this is a *trusted companion*, not a product to monetize off its users. Every decision optimizes for the viewer's trust — no data selling, no dark patterns, funded by optional donations. Trust is the product.

---

## 1. What we're building (decisions locked)

| Decision | Choice |
|---|---|
| Coverage | Any episodic video content — anime, streaming shows, broadcast & cable TV |
| Question types | Character, plot/world, and "does X happen?" checks |
| Input | User types show name + current episode |
| When the answer would spoil | Tease safely — hint it's coming, no details |
| Answer source | AI grounded on episode-bounded summaries (RAG) |
| Comments | Aggregate existing community threads per episode, shown raw behind a "may contain spoilers" tap |
| Native comment threads | Deferred to a later phase |
| Research layer | Opt-in glass-box surface over a shared engine — never touches the default user experience |
| LLM provider | Google Gemini free tier (2.5 Flash), key held server-side by the maintainer |
| Deployment | Hosted PWA for everyone; self-host + Ollama/own-key path for researchers |

---

## 2. The core insight (unchanged by expansion)

The spoiler guarantee comes from **what the model is allowed to see**, not from asking it to hold back.

You fetch only episodes 1-through-N material, hand the model *just that*, and instruct it to answer solely from what it's given — and to tease safely when the answer isn't in there yet. The boundary lives in your code, before any text reaches the model. This works identically whether the show is anime, a Netflix thriller, or a cable drama.

This also means **real-time web fetching is already the plan** — the app fetches current episode summaries at request time (and caches them), so shows that aired last week work exactly the same as shows from 2005.

---

## 3. Feasibility verdict

**Fully buildable.** Expanding beyond anime actually *improves* the situation — the general TV data ecosystem (TMDB in particular) is more complete and better documented than the anime-only ecosystem. A solo MVP is very reasonable.

**The realistic coverage picture by content type:**

| Content type | Q&A coverage | Comment coverage |
|---|---|---|
| Popular streaming (Netflix, HBO, Disney+) | Excellent | Excellent (dedicated subreddits) |
| Broadcast/cable (past & present) | Excellent | Good |
| Anime | Very good | Good (r/anime episode threads) |
| Obscure/older shows | Thin | Thin |

---

## 4. Data sources

### For the Q&A feature

**Primary metadata layer — general TV:**
- **TMDB (The Movie Database)** — free API, per-episode synopses, cast, air dates, season data for virtually all mainstream shows. Better and more complete than any anime-specific API for general content. No cost for reasonable usage.
- **TheTVDB** — strong alternative/supplement, especially for older broadcast content.

**Primary metadata layer — anime:**
- **AniList GraphQL API** — 500k+ anime entries, characters, airing data, free for public reads. Complementary to TMDB for anime-specific metadata.
- **Jikan** (unofficial MyAnimeList) — per-episode endpoint, good supplement.

**Episode-summary layer (the grounding text — the real gold):**
- **Wikipedia "List of ___ episodes" pages** — per-episode plot summaries for virtually every popular show across all genres. Primary source.
- **Fandom/wiki pages** — richer detail but no clean API (scraping required). Secondary source.

### For the comments feature

- **Reddit** — dedicated subreddits for virtually every popular show with per-episode discussion threads. Free API via OAuth, perfect for an open source hobby project.
- **MyAnimeList forums** (via Jikan) — supplement for anime-specific threads.
- Reddit episode discussion threads are actually *richer* for mainstream TV than for anime — this feature gets stronger with the expansion.

---

## 5. Architecture

```
User (types show name + episode, asks question)
        │
        ▼
Frontend  ──►  Backend API
                   │
                   ├─► Detect content type → route to right API
                   │     Anime → AniList / Jikan
                   │     Streaming & TV → TMDB / TheTVDB
                   │
                   ├─► Fetch summaries for episodes 1..N  (Wikipedia/Fandom, cached)
                   │
                   ├─► Build prompt:  [only 1..N summaries]  +  question
                   │     + rule: answer only from this; tease safely if not present
                   │
                   └─► LLM  ──►  spoiler-safe answer
        │
        ▼
Comments panel  ──►  fetch matching episode discussion thread (collapsed by default)
```

The key property: episodes N+1 onward **never enter the prompt**. The model cannot spoil from content it was never given.

---

## 6. Suggested tech stack

- **Frontend:** React / Next.js
- **Backend:** Node or Python — thin API that orchestrates metadata lookup, summary retrieval, and the LLM call
- **LLM:** Any capable model via API. A small/fast model is fine for most questions and keeps cost low.
- **Cache/DB:** Postgres (or SQLite to start) — cache fetched summaries keyed by show + episode so you're not re-fetching constantly
- **Hosting:** Vercel/Netlify (frontend) + small backend host; both have free tiers for an MVP

---

## 6a. Deployment & access model

The app has two audiences with very different needs, served by two deployment paths from **one codebase**.

### Path 1 — Hosted site (for everyone, including mobile)

The default front door. A casual viewer opens the website and asks a question — no key, no install, no payment.

- **The LLM key lives on your server**, not the user's. You hold one Google Gemini key in an environment variable; every user's question flows through it. Users never see or touch it.
- **Cost stays at ~$0** via Gemini's free tier (~1,500 requests/day, no credit card). Guard it with a **per-user daily question cap** so one heavy user can't drain the shared quota, and lean on the summary cache so repeated questions about the same show/episode are cheap.
- **Mobile = PWA.** Ship the web app as a Progressive Web App (manifest + service worker). Users tap "Add to Home Screen" and get an app-like icon and fullscreen launch. One codebase covers iOS, Android, and desktop — no app store, no review, no fees. A native wrapper (e.g. Capacitor) is an optional far-future step, not needed to be on phones.
- **Donations** (Ko-fi / GitHub Sponsors) are gravy on top of a free-tier setup, not a lifeline.

*Privacy note:* free LLM tiers often use prompts to improve their models and change quotas without warning. For this app that's low-stakes (questions about TV shows), so it's an acceptable trade — and the pluggable model layer means swapping providers is a one-line change if terms shift.

### Path 2 — Self-host (for researchers and privacy/power users)

Not the casual path — the heavy-duty one. Someone clones the GitHub repo and runs the whole project on their own hardware.

- Point it at a **local model via Ollama** (fully free, fully private, no API at all) or their **own API key**.
- This is where **serious research** happens: batch-running a benchmark of thousands of queries across multiple models would be slow, rate-limited, and costly on the hosted instance — so it runs locally, on the researcher's hardware and their own dime. Your hosted quota is never touched.
- The GitHub repo itself is therefore the real research artifact; the hosted site is the friendly demo and light-research face.

**Why this keeps the project sustainable:** heavy compute always lands on whoever generates it. Casual users share your small free-tier budget (capped per user); researchers bring their own everything. Your hosting and LLM costs stay near zero regardless of how popular or research-active the project gets.

### No user-facing model picker

The model is set by **config, not by a dropdown**. On the hosted site *you* pick a Flash-tier default — casual users never choose, which keeps the front door frictionless and, more importantly, stops users from routing your limited free quota through arbitrary (or pricier) models. The flexibility lives in the **pluggable model layer**, not a UI feature: self-hosters and researchers set the model via config/env for their own cloned instance, on their own compute, for free. (A per-request picker only becomes reasonable if bring-your-own-key is ever added to the hosted site — a possible later nicety, not part of the MVP.)

---

## 7. Effort & cost

**Effort (solo, part-time):**
- Proof-of-concept: a weekend
- Shippable MVP: ~2–4 weeks of evenings

**Running cost — effectively zero for a hobby project:**
- TMDB, AniList, Jikan: free
- Reddit API: free (the commercial tier concern doesn't apply to an open source hobby project)
- LLM API: the only real cost — at hobby-project volume, a few dollars a month at most with a small model. Cache episode summaries aggressively to minimize context tokens per request.
- Hosting: free tiers on Vercel/Netlify + a small backend host are plenty.

---

## 8. Top risks & mitigations

1. **Model leaks from its own training knowledge** despite the bounded context. → Strong system prompt ("use only the provided episode summaries"), and validate this explicitly in Phase 0. This is the #1 risk to prove out before anything else.
2. **No per-episode summaries for obscure shows.** → Detect low/no coverage and say so clearly. Never guess and risk spoiling.
3. **Episode-numbering chaos** — season vs. absolute numbering, specials, recap episodes, filler, OVAs, broadcast vs. streaming order, sub/dub gaps. → Normalize numbering carefully; this is the fiddliest engineering work, especially across content types.
4. **Comments contain spoilers** (you chose raw threads). → Mitigate cheaply: only pull the thread matching episode N, collapse it behind a "may contain spoilers" tap. AI filtering is a later upgrade.
5. **TMDB/Wikipedia rate limits.** → Cache aggressively; you'll serve the same episode summaries repeatedly.
6. **Content-type detection.** → "Attack on Titan" → anime. "The Bear" → general TV. Some edge cases (anime on Netflix) need a fallback strategy — try both APIs and merge.

---

## 9. Phased build plan

**Phase 0 — Prove the spoiler boundary (a weekend)**
Hardcode one show's episode summaries (pick something popular with a known major twist). Feed only episodes 1..N to the model and actively try to make it spoil future events. If context-bounding holds, the concept is validated. *Don't build anything else until this passes.*

**Phase 1 — Q&A MVP**
Search via TMDB (general TV) + AniList (anime) → detect content type → fetch and cache episode summaries → bounded LLM answer with "tease safely" behavior → simple web UI (show name + episode + question box). Ship this.
*Build the **trace object** (Section 11) into the pipeline now, even though the UI only shows the answer. It's the seam every research feature later hangs on, and adding it upfront costs almost nothing.*

**Phase 2 — Per-episode comments**
Pull the matching Reddit episode discussion thread, display it collapsed behind a spoiler tap. Supplement with MAL forum threads for anime. Add a show-type router so the right subreddit is found for each show.

**Phase 3 — Progress tracking / accounts**
Remember which show + episode a user is on so they don't re-enter it each time. Natural quality-of-life upgrade from the manual-entry MVP.

**Phase 4 — Native comment threads**
Users post per-episode comments inside the app, gated by episode — a comment only appears to people at or past that point. Needs auth + basic moderation.

**Phase 5 — Polish & expansion**
AI spoiler-filtering on aggregated comments, better episode numbering normalization, coverage indicators, and quality-of-life improvements.

### Research track (parallel — starts once the Phase 1 pipeline exists)

These don't block the consumer app and don't touch its UX. They build *on top of* the same engine.

**R1 — Reproducible context.** Version and snapshot the retrieved summaries so a given (show, episode, question) always replays with identical context. *Doubles as the caching that makes the consumer app fast.*

**R2 — Benchmark dataset v0.** Hand-curate a small set: shows with known twists, each with (episode boundary, question, correct spoiler-free answer, spoiler answer, leak labels). The crown jewel — publishable on its own, grows over time.

**R3 — Automated leak metric + eval harness.** Since you hold summaries for *all* episodes, you can flag when an answer references content whose earliest appearance is after episode N — an objective spoiler-leak score. Wrap it in a batch runner that scores any model against the benchmark.

**R4 — Researcher API + glass-box mode + pluggable models.** Expose the trace and let researchers swap models and compare faithfulness. Opt-in surface, separate route.

**R5 — Release.** Public leaderboard ("which models best respect a knowledge boundary?"), open dataset, and a writeup.

---

## 10. Recommended first move

Build **Phase 0 and nothing else.** Pick one show with a famous twist (e.g. a show where a major character dies unexpectedly), hardcode its episode summaries, and spend a weekend trying to make the bounded model spoil it. The entire product rests on this one architectural assumption holding. One weekend answers it — far cheaper to learn early than after building the full app.

---

## 11. Research layer — the app as a measurement instrument

### The reframe

The app isn't only a tool that answers questions — it's a controlled environment with a **verifiable knowledge boundary**. For any (show, episode N, question), you can know the correct spoiler-free answer, the spoiler answer, and therefore whether a model *leaked*. That pairing — bounded context **plus** known ground truth — is exactly what most context-faithfulness research lacks. Your app generates it as a byproduct of doing its normal job.

### The one rule that protects the everyday app

**No research feature may touch the default user path.** If it can't live behind an opt-in surface, it doesn't ship. This single rule is what lets the two audiences coexist.

### Design principle: one engine, two faces

Never fork the codebase into an "app build" and a "research build" — they'd drift apart and both would rot. Instead, one core pipeline emits a structured **trace** for every query, and two thin surfaces sit on top:

- **Consumer surface (default):** shows only the answer + comments. Black box. Fast, clean, zero clutter.
- **Research surface (opt-in):** exposes the trace, swaps models, runs batches, scores results. Glass box. Separate route, hidden by default.

The research surface *reads from* the same engine; it never alters the consumer path. A casual user never knows it exists.

### The trace object (the key primitive)

Every query — whoever asked — produces one structured record:

```
query_id, timestamp
resolved_title, content_type, episode_boundary_N
retrieval: { source, episodes_fetched, snapshot_version, char_count }
context_sent          # the exact text handed to the model
prompt_template_version
model: { provider, name, params }
output: { raw_answer, classification: safe | tease | leak }
eval (if ground truth exists): { expected_answer, leak_detected, leak_score }
latency_ms, token_counts
```

The consumer UI ignores it. The research UI renders it. The logging layer optionally persists it (with consent). Building this in Phase 1 costs almost nothing and is the foundation of everything research-facing.

### Where user needs and research needs align (free wins)

- **Snapshotting summaries:** research needs frozen context for reproducibility; users benefit because caching = speed. *Same feature.*
- **Pluggable models:** research needs to compare models; users and contributors get local/free models (Ollama) and choice. *Same feature.*
- **Tracing:** research needs measurement; users gain trust from a lite "answered using episodes 1–5" badge, and you gain debuggability. *Same feature, two depths.*

### Where they diverge (and how to keep them apart)

- **Data logging** — research wants query data, users want privacy. → Consent-gated, anonymized, opt-out, **off by default**. The curated benchmark matters more than raw logs anyway.
- **UI complexity** — research wants dials, users want none. → Separate surface behind a mode toggle/route.
- **Freshness vs. determinism** — the live app wants current summaries, research wants frozen ones. → Snapshot versioning serves both: live serves latest, eval pins a version.

### Two operating modes of the same engine

- **Live mode (consumer):** real question, no ground truth, serve a good answer.
- **Eval mode (research):** run the curated benchmark with known answers, auto-score faithfulness and leaks.

### Research areas this maps to

1. **Context faithfulness vs. parametric knowledge** — the headline. Does a model answer from the bounded context, or cheat from training data? You can catch leaks objectively.
2. **Temporal spoiler detection** — not "is this a spoiler?" but "is this a spoiler *at episode N*?" A novel dimension over existing binary spoiler-detection work.
3. **Constrained generation** — the "tease safely" behavior: acknowledge something exists without revealing it. How do you measure a tease that leaks too much? Barely studied.
4. **Benchmark/dataset creation** — bounded narrative QA with known ground truth is a genuinely useful, publishable asset.

### The concrete research artifacts you'd contribute

- **Instrumented engine** — the traceable pipeline (Phase 1).
- **Benchmark dataset** — curated, versioned (show, episode, question, safe answer, spoiler answer, leak labels). The crown jewel.
- **Automated leak metric** — flags answers referencing content whose earliest appearance is after episode N. Objective and cheap, because you hold the full episode timeline.
- **Eval harness** — batch-run the benchmark through any pluggable model; output faithfulness + leak scores.
- **Researcher API / glass-box mode** — programmatic access to the pipeline internals.
- **Public leaderboard + open dataset + writeup** — community-driving and paper-worthy.

### Why this doesn't slow the app down

Everything research-facing is either (a) a byproduct the consumer path already produces (the trace), (b) a feature that helps users too (snapshots, model choice), or (c) a separate opt-in surface built *after* the app works. The app ships first; the research layer grows on top without ever getting in a viewer's way.