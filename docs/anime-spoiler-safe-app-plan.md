# Spoiler-Safe Anime Companion — Feasibility & Build Plan

*A web app that answers questions about the anime you're watching, bounded by the episode you're on, so you never get spoiled — plus a per-episode community reaction feed.*

---

## 1. What we're building (decisions locked so far)

| Decision | Choice |
|---|---|
| Coverage | Any anime (realistically: any with per-episode summaries available) |
| Question types | Character, plot/world, and "does X happen?" checks |
| Input | User types anime name + current episode |
| When the answer would spoil | Tease safely — hint it's coming, no details |
| Answer source | AI grounded on episode-bounded summaries (my recommendation) |
| Comments | Aggregate existing community threads per episode, shown raw (collapsed behind a "may contain spoilers" tap) |
| Native comment threads | Deferred to a later phase |

---

## 2. The core challenge, and the key insight

Every hard part of this app is the same problem wearing two hats: **information that's safe at episode N is a spoiler at episode N‑1.**

The naive approach — let an AI answer from its own anime knowledge — is the *most* dangerous, because a model holds the whole story blended together and can't reliably tell "known by episode 8" from "revealed in the finale." It will leak eventually.

**The fix is to stop relying on the model's restraint and instead control what it can see.** You retrieve only the episode 1‑through‑N material, hand the model *just that*, and instruct it to answer solely from what it's given — and to "tease safely" when the answer isn't in there yet. The spoiler guarantee then becomes a property of the input, not the model's willpower. This pattern is called **RAG** (retrieval-augmented generation), and it's what makes the whole idea viable.

The same episode-N boundary that gates answers also gates which comment threads you show.

---

## 3. Feasibility verdict

**Buildable — yes, and a solo MVP is very reasonable.** The metadata is free, the AI layer is straightforward, and the spoiler boundary is architecturally sound rather than hopeful.

**The one expectation to reset:** "any anime" really means "any anime that has per-episode summaries somewhere." That's excellent for popular/mainstream shows and thins out for obscure ones. The app should degrade gracefully — saying "I only have light info past episode X" instead of guessing and risking a spoiler.

---

## 4. Data sources

### For the Q&A feature

**Metadata layer (easy, reliable, free):**
- **AniList GraphQL API** — 500k+ entries, characters, staff, airing data, no API key for public reads, ~90 requests/min. Great for search, episode counts, air dates.
- **Jikan** (unofficial MyAnimeList) — similar, plus a per-episode endpoint.
- *Caveat:* their series descriptions and character bios cover the **whole series** — inherently spoilery. Use this layer for structure, not for answers.

**Episode-summary layer (the actual grounding text):**
- **Wikipedia "List of ___ episodes" pages** — per-episode plot summaries, roughly episode-bounded. The primary gold.
- **Fandom episode pages** — richer, but no clean API (scraping), inconsistent structure.
- *Reality:* coverage skews toward popular titles. This is where the scope reset bites.

### For the comments feature

- **Reddit r/anime "Episode Discussion" threads** — the canonical per-episode reaction source. Free tier (~100 queries/min, OAuth) is fine for a non-commercial project. **Commercial/monetized use requires an approved contract (~$12k/mo) or a third-party data provider** — the single biggest business-model flag in this plan.
- **MyAnimeList forum topics** (via Jikan) — an alternative/supplement without Reddit's commercial licensing wall.

---

## 5. Architecture (plain-language)

```
User (types anime + episode, asks question)
        │
        ▼
Frontend  ──►  Backend API
                   │
                   ├─► Resolve title → AniList (get ID, episode count)
                   │
                   ├─► Fetch summaries for episodes 1..N  (Wikipedia/Fandom, cached)
                   │
                   ├─► Build prompt:  [only 1..N summaries]  +  question
                   │        + rule: "answer only from this; if not present, tease safely"
                   │
                   └─► LLM  ──►  spoiler-safe answer
        │
        ▼
Comments panel  ──►  fetch the episode-N discussion thread (collapsed by default)
```

The critical property: the later-episode text **never enters the prompt**, so the model literally cannot spoil from it.

---

## 6. Suggested tech stack

- **Frontend:** React / Next.js (fast to build, good mobile web).
- **Backend:** Node or Python — thin API that orchestrates retrieval + the LLM call.
- **LLM:** Any capable model via API (e.g. Claude). A smaller/faster model is fine for most questions and keeps cost low.
- **Cache/DB:** Postgres or even SQLite to start — cache fetched summaries and resolved titles so you're not re-scraping.
- **Hosting:** Vercel/Netlify (frontend) + a small backend host; both have free tiers for an MVP.

---

## 7. Effort & rough cost

**Effort (solo, part-time):**
- Proof-of-concept: a weekend.
- Shippable MVP: roughly 2–4 weeks of evenings, depending on experience.

**Running cost at MVP scale:**
- Data APIs: free (AniList, Reddit non-commercial, Jikan).
- LLM: the main variable. Each question sends the 1..N summaries as context, so cost scales with how many episodes deep the user is — think cents-scale per question with a small model, and cache aggressively.
- Hosting: free-to-low on starter tiers.

*The cost cliff isn't tokens — it's Reddit's commercial tier if/when you monetize.*

---

## 8. Top risks & mitigations

1. **Model leaks from its own training knowledge** despite the bounded context. → Strong system prompt ("use only provided summaries"), and test this explicitly (see Phase 0). This is the #1 risk to validate before anything else.
2. **Thin or missing summaries for obscure anime.** → Detect low coverage and say so honestly rather than guessing.
3. **Episode-numbering mismatches** — broadcast vs. streaming order, filler episodes, recap movies, sub/dub gaps, seasons counted separately. → Normalize numbering carefully; this is the fiddliest engineering work.
4. **Comments contain spoilers** (you chose raw threads). → Mitigate cheaply by only pulling the thread that matches episode N and collapsing it behind a "may contain spoilers" tap. AI filtering is a later upgrade.
5. **Reddit commercial licensing** if the app is ever monetized. → Design the comment layer as a swappable module (Reddit today, MAL/third-party later) so you're not locked in.
6. **General hallucination.** → Keep answers grounded in retrieved text; cite which episode a fact came from where possible.

---

## 9. Phased build plan

**Phase 0 — Prove the spoiler boundary (a weekend).**
Hardcode one anime's episode summaries. Feed only episodes 1..N to the model and try hard to make it spoil. If context-bounding holds, the whole concept is validated. *Don't build anything else until this passes.*

**Phase 1 — Q&A MVP.**
Title search via AniList → fetch + cache episode summaries → bounded LLM answer with the "tease safely" behavior → simple web UI (anime + episode + question box). Ship this.

**Phase 2 — Per-episode comments.**
Pull the matching Reddit episode discussion thread, display it collapsed behind the spoiler tap. Add MAL forum threads as a second source.

**Phase 3 — Progress tracking / accounts.**
Remember which anime + episode a user is on so they don't re-enter it. (You chose manual entry for the MVP; this is the natural quality-of-life upgrade.)

**Phase 4 — Native comment threads.**
Your "start your own thread" feature: users post per-episode comments inside the app, gated by episode so a comment only appears to people at or past that point. Needs auth + moderation.

**Phase 5 — Polish.**
AI spoiler-filtering on aggregated comments, better numbering handling, coverage indicators, and quality-of-life features.

---

## 10. Recommended first move

Build **Phase 0** and nothing else. The entire product rests on one unproven assumption: *does feeding a model only episodes 1..N actually stop it from spoiling?* One weekend answers that. If yes, you have a real product. If it's leaky, you'll want spoiler-filtering on the output layer before investing further — far cheaper to learn that on day one than after building the whole app.
