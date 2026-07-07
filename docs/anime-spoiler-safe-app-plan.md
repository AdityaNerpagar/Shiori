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

---

## 12. Ownership & future optionality

Open sourcing the project does **not** give away ownership or prevent a future sale — it just changes what a buyer would be buying. Worth setting up cleanly now so no doors close accidentally.

### The core facts

- **You keep ownership.** Releasing under a license (MIT/Apache) makes you the copyright holder who *granted a license* — you can still sell, relicense your own code, or offer a commercial version later. Open source and sellable are not opposites.
- **What's public stays public.** You can't claw back released code; anyone can fork what exists under the license granted. So a buyer can't purchase *exclusivity over the current code* — that's already out.
- **A sale is therefore about what's *not* in the repo:** you (your continued work/roadmap), the brand + users + hosted instance + domain, the trademarked name, any future closed-source work, and potentially the dataset.
- **Forking rarely destroys value.** A fork is just code — no users, reputation, momentum, or you. That's why acquirers buy projects instead of forking them. It does *cap* the price (no monopoly to sell), which is a trade already made by choosing open source — and the right one for a trust-based companion app.

### Cheap moves that preserve optionality (do these)

1. **Keep copyright ownership clean.** As sole author you hold all rights. If you accept outside contributions, use a lightweight **Contributor License Agreement (CLA)** or Developer Certificate of Origin so you retain the ability to relicense. *If many contributors own scattered pieces, you cannot take a future version closed or sell cleanly without every one of them agreeing — the most common way OSS projects accidentally make themselves unsellable.*
2. **Hold the name and domain personally.** Cheap, and often the single most valuable transferable asset. Consider keeping the project **name/trademark** even if the code is open — forkers can copy code but not the identity.
3. **Keep the dataset as a distinct asset.** Its value is as an *open, cited* research artifact; treat it separately from the app code either way.

### Bottom line

A life-changing acquisition is unlikely for a niche hobby project (true open source or not). But a modest "come work on this / we'll take it over" offer is entirely possible if it grows — and open sourcing forecloses none of it, as long as copyright, name, and domain stay cleanly yours. Build it open, keep ownership tidy, and the option to sell stays alive without compromising the trusted-companion mission today.

---

## 13. Community features & free-at-scale design

For this app, **community features and cost-control are the same lever.** Crowdsourcing builds the community *and* removes your costs; caching drives retention-friendly speed *and* removes your costs. Designed right, the app has **inverted unit economics** — cost per user *falls* as it grows.

### The free-at-scale engine (why it gets cheaper per user, not more expensive)

The core trick, borrowed from DoesTheDogDie's crowdsourced model: **do expensive work once, then serve it to everyone for free.**

- **Cache every answer** by (show, episode, normalized question). The 100th person asking "who is the masked figure?" about episode 5 of a popular show gets a cached answer — **zero LLM cost**. As the user base grows, the cache-hit rate *rises*, so the marginal LLM cost per user trends toward zero. This is the single most important economic property: popular content pays its LLM cost once.
- **Crowdsourced content = $0 content cost.** Users contribute reactions, corrections, and coverage; the community does the labor once and everyone benefits.
- **Cache third-party data** (episode summaries, TMDB/AniList responses) once per show/episode — never re-fetch.
- **Net effect:** the thing that would grow with scale (LLM calls) is exactly the thing caching flattens. Costs scale sub-linearly with users.

### Community features (borrowed from the landscape, adapted)

**Group A — the return loop (retention):**
- **Per-episode reaction feed** — the retention engine. A spoiler-safe reason to open the app *after every episode*. This is the highest-leverage community feature; prioritize it.
- **"Currently watching" + episode progress** — a personalized home and a reason to come back each episode. Cheap (a few DB rows per user).
- **Safe weekly discussion threads** per currently-airing show.

**Group B — crowdsourcing (engagement + cost reduction, the DoesTheDogDie core):**
- **Community-verified answers** — upvote/downvote and flag spoilers or wrong answers. This *improves the cached answers for free*, turning the community into your QA team.
- **"Add a show" / "improve this summary"** contributions — expands coverage without your labor, and grows exactly the corpus that reduces LLM reliance.
- **Crowd yes/no "does X happen?" checks**, episode-bounded — cheap, cache-friendly, low-LLM, and directly modeled on DoesTheDogDie's free crowdsourced answers.
- **Spoiler-safe descriptions as a craft** — their "know it's coming, no details" style, applied per episode.
- **Contributor reputation / trusted-user tiers** — status reward that doubles as near-free moderation (see below).

**Group C — status & light gamification (from the quiz apps):**
- **Profiles and badges** (including a supporter/contributor badge).
- **Contributor leaderboards** — rank by helpful contributions, not just activity.
- **Streaks and "shows completed"** — light habit mechanics, cheap to run.
- **Per-show hub pages** — a home for each series' safe discussion and crowd answers.
- **Shareable artifacts** — "the most-confusing episodes," spoiler-anxiety heatmaps per show. These are *free marketing*: people post and link them back.

**Group D — trust signals (the donation drivers):**
- **No ads, ever** — stated plainly and kept.
- **Open source and transparent** — anyone can verify the app is honest.
- **"Supported by donations"** visible, with a clear, human mission.

### Funding without running cost (DoesTheDogDie template, adapted)

- **Core stays free forever**, powered by crowdsourcing + cache.
- **Optional supporter tier** whose perks cost you ~$0 to provide: a badge, voting on the roadmap, priority on show/feature requests, early access to new features, and (optionally) bring-your-own-key for unlimited questions. Perks are **status and access, not compute**, so they never add cost.
- **No ads** — protects trust and keeps ad-network trackers off a privacy-friendly app.

### The one real scaling cost — moderation — and how to keep it near-free

DoesTheDogDie *pays* moderators; a hobby project can't and shouldn't. Keep the human load minimal by design:
- **Community flagging** with **auto-collapse** of flagged content.
- **Trusted-contributor tiers** who earn light mod powers as a *status reward* (free labor that people want).
- **Defer native moderation entirely** in early phases: while comments are pulled from Reddit (already moderated there), you inherit their moderation — your own load doesn't begin until native threads arrive in Phase 4.
- Lightweight admin tools over anything fancy.

### Caching-first discipline (the rule that keeps it free)

1. **Never call the LLM if a cached answer exists** for (show, episode, normalized question).
2. **Cache all summaries and API responses** per show/episode.
3. **Per-user daily question cap** to bound worst-case cost and abuse.
4. **Serve popular/static content via CDN** where possible.

Follow these four and the free tiers (Gemini + hosting + managed Postgres) comfortably absorb a large, growing user base — because the users themselves, through contributions and cache hits, are doing the expensive work once and sharing it.

---

## 14. Caching model & feedback

### Caching model (shared, but episode-scoped)

The cache is **global across all users** — that's what makes the economics work — but it must be **strictly partitioned by episode boundary**, because that partition is also a safety boundary.

**The cache keys:**
- **Episode summaries** (grounding text): keyed by `(show, episode)`. Fetched once from Wikipedia/etc., reused for everyone forever. Pure win, no subtlety.
- **Answers:** keyed by `(show, episode, normalized_question)`. Shared across all users *at that episode*.
- **User progress / "currently watching":** per-user, never shared. The only genuinely personal data, and tiny.

**The safety rule (do not get this wrong):**
- ✅ Key = `(show, episode, question)` → the episode-5 answer is only ever served to people at episode 5. Someone at episode 3 gets a different entry, bounded to episode 3.
- ❌ Key = `(show, question)`, dropping episode → whoever asks first sets the answer for everyone. If they were on episode 20, you'd serve spoiler-laden episode-20 answers to someone on episode 3. **The cache becomes a spoiler-delivery machine.**

The same question at episode 5 and episode 12 are **two separate cache entries** — they legitimately have different safe answers. This is the one place where "share to save money" and "never spoil" could collide; the episode-scoped key keeps them aligned.

**Question normalization:** "Who's the masked guy?" and "who is that man in the mask?" are the same question but won't match as raw strings. Normalize (lowercase + strip filler, or better, embedding-similarity match on meaning) so semantically identical questions hit one entry. More normalization → higher hit rate → lower cost, with a small risk of collapsing two *slightly* different questions, so tune conservatively.

### Feedback (two levels, both feeding the cache and the research layer)

Feedback is how a *shared* answer gets corrected once and fixed for everyone — it's the community QA layer on top of the cache, and it doubles as labeled data for the research benchmark.

**Question-level feedback** (on each individual answer):
- Lightweight signals: 👍/👎, plus targeted flags — **"this spoiled me,"** "wrong," "didn't answer my question," "too vague."
- **The "this spoiled me" flag is the most important control in the whole app.** It catches spoiler leaks the automated metric misses, quarantines the offending cached answer (auto-collapse pending review), and feeds directly into the leak dataset in Section 11.
- A corrected answer replaces the cached entry → **fixed once, fixed for everyone.** The cache becomes a crowd-improved knowledge base that gets better as more people use it.

**System-level feedback** (on the app as a whole):
- General thumbs/rating, feature requests, "show missing / coverage thin here," bug reports, and a free-text channel.
- Feeds the roadmap (and supporter-tier voting from Section 13).

**Why this compounds:** every piece of feedback improves three things at once — the cached answer quality (cheaper + safer), the community's sense of ownership (engagement + donations), and the research dataset (labeled leaks and quality judgments). Feedback is where the cache, the community, and the research layer all reinforce each other.

**Keep it near-free:** feedback is a few DB rows and some flag-count thresholds — no added compute. Auto-collapse on flag-count keeps moderation load low (ties into Section 13's near-free moderation).