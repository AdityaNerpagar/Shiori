"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";

interface AnimeResult {
  id: number;
  idMal: number | null;
  episodes: number | null;
  status: string | null;
  format: string | null;
  seasonYear: number | null;
  title: { romaji: string | null; english: string | null };
  coverImage: { medium: string | null };
}

interface Coverage {
  source: string | null;
  total: number;
  maxEpisode: number;
}

interface QA {
  question: string;
  answer: string;
  provider: string;
  model: string;
  summariesUsed: number;
  streaming: boolean;
  episode: number;
}

interface CommentsData {
  mal: { title: string; url: string; comments: number | null } | null;
  reddit: {
    title: string;
    url: string;
    numComments: number;
    comments: { author: string; score: number; body: string }[];
  } | null;
  redditEnabled: boolean;
  malError: string | null;
  redditError: string | null;
}

function displayTitle(a: AnimeResult): string {
  return a.title.english || a.title.romaji || "Unknown";
}

/** Highlight "(episode N)" citations as lamp chips. */
function renderAnswer(text: string) {
  const parts = text.split(/(\((?:episode|ep\.?)\s*[\d,\s&–-]+\))/gi);
  return parts.map((part, i) =>
    /^\((?:episode|ep\.?)\s*[\d,\s&–-]+\)$/i.test(part) ? (
      <span key={i} className="cite">
        {part.slice(1, -1)}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
}

/** The bookmark boundary: lit episodes you've seen, veiled ones you haven't. */
function EpisodeBoundary({
  total,
  episode,
  setEpisode,
}: {
  total: number;
  episode: number;
  setEpisode: (n: number) => void;
}) {
  if (total <= 60) {
    return (
      <div className="strip" role="group" aria-label="Set your episode">
        {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            title={`Episode ${n}`}
            aria-label={`Episode ${n}`}
            aria-pressed={n === episode}
            onClick={() => setEpisode(n)}
            className={`tick${n <= episode ? " lit" : ""}${n === episode ? " here" : ""}`}
          />
        ))}
      </div>
    );
  }
  const pct = (episode / total) * 100;
  return (
    <div className="bar-wrap">
      <div className="bar">
        <div className="bar-lit" style={{ width: `${pct}%` }} />
      </div>
      <input
        type="range"
        min={1}
        max={total}
        value={episode}
        onChange={(e) => setEpisode(parseInt(e.target.value, 10))}
        className="bar-range"
        aria-label="Set your episode"
      />
      <div className="bar-mark" style={{ left: `${pct}%` }} />
    </div>
  );
}

const STARTERS = [
  "Recap everything I've seen so far",
  "Who are the main characters right now?",
  "What should I remember before the next episode?",
];

export default function Home() {
  // search
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AnimeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // selection
  const [anime, setAnime] = useState<AnimeResult | null>(null);
  const [episode, setEpisode] = useState(1);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [coverageLoading, setCoverageLoading] = useState(false);

  // Q&A
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<QA[]>([]);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  // comments
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<CommentsData | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  // provider badge
  const [health, setHealth] = useState<{
    llm: { provider: string; model: string };
    redditEnabled: boolean;
  } | null>(null);

  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => {});
  }, []);

  // debounced search
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const json = await res.json();
        setResults(json.results ?? []);
        setShowResults(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const selectAnime = useCallback((a: AnimeResult) => {
    setAnime(a);
    setQuery("");
    setResults([]);
    setShowResults(false);
    setEpisode(1);
    setHistory([]);
    setComments(null);
    setCommentsOpen(false);
    setRevealed(new Set());
    setCoverage(null);
    setCoverageLoading(true);

    const params = new URLSearchParams({
      title: a.title.english || a.title.romaji || "",
    });
    if (a.title.english && a.title.romaji) params.set("altTitle", a.title.romaji);
    fetch(`/api/coverage?${params}`)
      .then((r) => r.json())
      .then((c) => setCoverage(c))
      .catch(() => setCoverage(null))
      .finally(() => setCoverageLoading(false));
  }, []);

  // reset comments when episode changes
  useEffect(() => {
    setComments(null);
    setCommentsOpen(false);
    setRevealed(new Set());
  }, [episode, anime?.id]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [history.length]);

  const ask = useCallback(
    async (text?: string) => {
      const q = (text ?? question).trim();
      if (!anime || !q || asking) return;
      setQuestion("");
      setAskError(null);
      setAsking(true);

      const entry: QA = {
        question: q,
        answer: "",
        provider: "",
        model: "",
        summariesUsed: 0,
        streaming: true,
        episode,
      };
      // Follow-up context: completed exchanges asked at or below the current
      // episode (an answer given at a higher episode could leak backwards).
      const followUpHistory = history
        .filter((h) => !h.streaming && h.answer && h.episode <= episode)
        .slice(-6)
        .map((h) => ({ question: h.question, answer: h.answer }));

      setHistory((h) => [...h, entry]);
      const idx = history.length;

      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: anime.title.english || anime.title.romaji,
            altTitle: anime.title.romaji,
            episode,
            question: q,
            history: followUpHistory,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Request failed" }));
          throw new Error(err.error ?? "Request failed");
        }

        const provider = res.headers.get("X-Provider") ?? "";
        const model = decodeURIComponent(res.headers.get("X-Model") ?? "");
        const summariesUsed = parseInt(
          res.headers.get("X-Summaries-Used") ?? "0",
          10
        );
        setHistory((h) =>
          h.map((e, i) =>
            i === idx ? { ...e, provider, model, summariesUsed } : e
          )
        );

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response stream");
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          setHistory((h) =>
            h.map((e, i) => (i === idx ? { ...e, answer: e.answer + chunk } : e))
          );
        }
        setHistory((h) =>
          h.map((e, i) => (i === idx ? { ...e, streaming: false } : e))
        );
      } catch (err) {
        setAskError(
          `Couldn't get an answer — ${(err as Error).message}. Check that your model provider is running, then ask again.`
        );
        setHistory((h) =>
          h.map((e, i) => (i === idx ? { ...e, streaming: false } : e))
        );
      } finally {
        setAsking(false);
      }
    },
    [anime, question, episode, asking, history]
  );

  const loadComments = useCallback(async () => {
    if (!anime) return;
    setCommentsOpen(true);
    if (comments || commentsLoading) return;
    setCommentsLoading(true);
    try {
      const params = new URLSearchParams({
        episode: String(episode),
        title: anime.title.english || anime.title.romaji || "",
      });
      if (anime.idMal) params.set("malId", String(anime.idMal));
      if (anime.title.romaji) params.set("altTitle", anime.title.romaji);
      const res = await fetch(`/api/comments?${params}`);
      setComments(await res.json());
    } catch {
      setComments(null);
    } finally {
      setCommentsLoading(false);
    }
  }, [anime, episode, comments, commentsLoading]);

  const totalEpisodes =
    anime?.episodes ?? Math.max(coverage?.maxEpisode ?? 0, episode, 12);

  return (
    <main className="mx-auto max-w-2xl px-5 pb-24 pt-12">
      {/* ── header ── */}
      <header className="rise flex items-start justify-between gap-6">
        <div>
          <h1 className="wordmark">
            <span className="ribbon" aria-hidden />
            Shiori<span className="kanji">栞</span>
          </h1>
          <p className="mt-2 max-w-md text-[0.92rem]" style={{ color: "var(--paper-dim)" }}>
            Ask about the anime you&apos;re watching. Answers stop at your
            bookmark — nothing past your episode exists here.
          </p>
        </div>
        {health && (
          <div className="mt-2 flex shrink-0 items-center gap-2">
            <span className="lamp-dot" aria-hidden />
            <span className="eyebrow">
              {decodeURIComponent(health.llm.model)} ·{" "}
              {health.llm.provider === "anthropic" ? "claude" : "local"}
            </span>
          </div>
        )}
      </header>

      {/* ── search ── */}
      <div className="rise rise-1 relative mt-9">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setShowResults(true)}
          placeholder={
            anime ? "Switch to a different show…" : "Find the show you're watching…"
          }
          className="search-input"
        />
        {searching && (
          <span
            className="eyebrow absolute right-4 top-4"
            style={{ color: "var(--mute)" }}
          >
            searching
          </span>
        )}
        {showResults && results.length > 0 && (
          <div className="results">
            {results.map((a) => (
              <button key={a.id} onClick={() => selectAnime(a)} className="result-row">
                {a.coverImage.medium && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.coverImage.medium}
                    alt=""
                    className="h-12 w-9 rounded-[3px] object-cover"
                  />
                )}
                <div className="min-w-0">
                  <div className="truncate text-[0.95rem]">{displayTitle(a)}</div>
                  <div className="result-meta">
                    {[a.format, a.seasonYear, a.episodes ? `${a.episodes} EP` : "airing"]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── empty state ── */}
      {!anime && (
        <div className="rise rise-2 mt-20 text-center">
          <p className="show-title" style={{ color: "var(--paper-dim)" }}>
            Nothing is spoiled yet.
          </p>
          <p className="mt-2 text-sm" style={{ color: "var(--mute)" }}>
            Search your show, place your bookmark, ask freely.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {["Frieren", "Steins;Gate", "Vinland Saga"].map((s) => (
              <button key={s} className="chip" onClick={() => setQuery(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── selected show + boundary ── */}
      {anime && (
        <section className="mt-10">
          <div className="flex items-start gap-5">
            {anime.coverImage.medium && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={anime.coverImage.medium}
                alt=""
                className="h-24 w-[66px] rounded-[4px] object-cover"
                style={{ boxShadow: "0 10px 30px rgba(0,0,0,.5)" }}
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="eyebrow">
                {[anime.format, anime.seasonYear].filter(Boolean).join(" · ")}
              </div>
              <h2 className="show-title mt-1">{displayTitle(anime)}</h2>
              <div className="eyebrow mt-2">
                {coverageLoading ? (
                  "checking episode notes…"
                ) : coverage && coverage.total > 0 ? (
                  <>
                    <span className="lit">{coverage.total} episode notes</span>
                    {" · "}
                    {coverage.source}
                  </>
                ) : (
                  <span style={{ color: "var(--danger)" }}>
                    no episode notes found — answers will stay cautious
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-7 flex items-end justify-between gap-4">
            <div className="eyebrow">
              Your bookmark · <span className="lit">episode {episode}</span>
              {anime.episodes ? ` of ${anime.episodes}` : " (airing)"}
            </div>
            <input
              type="number"
              min={1}
              max={totalEpisodes}
              value={episode}
              onChange={(e) =>
                setEpisode(
                  Math.max(
                    1,
                    Math.min(totalEpisodes, parseInt(e.target.value || "1", 10))
                  )
                )
              }
              className="ep-num"
              aria-label="Episode number"
            />
          </div>
          <EpisodeBoundary
            total={totalEpisodes}
            episode={episode}
            setEpisode={setEpisode}
          />
        </section>
      )}

      {/* ── reading log ── */}
      {anime && (
        <section className="mt-12">
          {history.length === 0 && (
            <div className="mb-6">
              <div className="eyebrow mb-3">Try asking</div>
              <div className="flex flex-wrap gap-2">
                {STARTERS.map((s) => (
                  <button key={s} className="chip" onClick={() => ask(s)} disabled={asking}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {history.map((qa, i) => (
            <article key={i} className="qa">
              <div className="eyebrow">
                You · <span className="lit">EP {qa.episode}</span>
              </div>
              <h3 className="qa-q">{qa.question}</h3>
              <div className="qa-a">
                {renderAnswer(qa.answer)}
                {qa.streaming && qa.answer && <span className="caret" aria-hidden />}
                {qa.streaming && !qa.answer && (
                  <span className="patience">
                    <span className="lamp-dot" aria-hidden />
                    reading episodes 1–{qa.episode}… local models take a minute or two
                  </span>
                )}
              </div>
              {!qa.streaming && qa.provider && qa.provider !== "none" && (
                <div className="qa-meta">
                  grounded on {qa.summariesUsed} episode{" "}
                  {qa.summariesUsed === 1 ? "note" : "notes"} · {qa.model}
                </div>
              )}
            </article>
          ))}
          <div ref={logEndRef} />

          {askError && <div className="err mt-5">{askError}</div>}

          <div className="mt-8 flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()}
              placeholder={`Ask anything up to episode ${episode}…`}
              disabled={asking}
              className="search-input"
            />
            <button
              onClick={() => ask()}
              disabled={asking || !question.trim()}
              className="ask-btn"
            >
              {asking ? "Reading…" : "Ask"}
            </button>
          </div>
        </section>
      )}

      {/* ── beyond the veil: community ── */}
      {anime && (
        <section className="mt-14">
          {!commentsOpen ? (
            <button onClick={loadComments} className="fold">
              <span className="eyebrow" style={{ color: "var(--paper-dim)" }}>
                Beyond the veil
              </span>
              <div className="mt-1 text-sm">
                Community reactions to episode {episode} — unfiltered threads,
                spoilers possible. Comments stay blurred until you tap them.
              </div>
            </button>
          ) : (
            <div className="cold-panel">
              <div className="flex items-baseline justify-between">
                <div className="eyebrow">Episode {episode} · community</div>
                <button
                  onClick={() => setCommentsOpen(false)}
                  className="eyebrow"
                  style={{ color: "var(--mute)" }}
                >
                  close
                </button>
              </div>

              {commentsLoading && (
                <p className="patience mt-4">
                  <span className="lamp-dot" aria-hidden />
                  finding threads…
                </p>
              )}

              {!commentsLoading && comments && (
                <div className="mt-4 space-y-6">
                  <div>
                    <div className="eyebrow mb-2">MyAnimeList</div>
                    {comments.mal ? (
                      <a
                        href={comments.mal.url}
                        target="_blank"
                        rel="noreferrer"
                        className="quiet text-sm"
                      >
                        {comments.mal.title}
                        {comments.mal.comments != null
                          ? ` · ${comments.mal.comments} comments`
                          : ""}{" "}
                        ↗
                      </a>
                    ) : (
                      <p className="text-sm" style={{ color: "var(--mute)" }}>
                        No discussion thread found for this episode.
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="eyebrow mb-2">Reddit · r/anime</div>
                    {!comments.redditEnabled ? (
                      <p className="text-sm" style={{ color: "var(--mute)" }}>
                        Reddit is off. Add REDDIT_CLIENT_ID and
                        REDDIT_CLIENT_SECRET to .env.local and it turns on by
                        itself.
                      </p>
                    ) : comments.reddit ? (
                      <div>
                        <a
                          href={comments.reddit.url}
                          target="_blank"
                          rel="noreferrer"
                          className="quiet text-sm"
                        >
                          {comments.reddit.title} ↗
                        </a>
                        <div className="mt-2">
                          {comments.reddit.comments.map((c, i) => (
                            <div key={i} className="comment">
                              <div className="comment-meta">
                                u/{c.author} · {c.score} points
                              </div>
                              <div
                                className={`comment-body text-sm${revealed.has(i) ? " revealed" : ""}`}
                                title={revealed.has(i) ? undefined : "Tap to reveal"}
                                onClick={() =>
                                  setRevealed((r) => new Set(r).add(i))
                                }
                              >
                                {c.body}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm" style={{ color: "var(--mute)" }}>
                        No matching discussion thread found for this episode.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
