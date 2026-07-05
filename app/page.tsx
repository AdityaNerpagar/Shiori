"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  episode: number; // episode the question was asked at
}

interface CommentsData {
  mal: {
    title: string;
    url: string;
    comments: number | null;
  } | null;
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

  // provider badge
  const [health, setHealth] = useState<{
    llm: { provider: string; model: string };
    redditEnabled: boolean;
  } | null>(null);

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
  }, [episode, anime?.id]);

  const ask = useCallback(async () => {
    if (!anime || !question.trim() || asking) return;
    const q = question.trim();
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
    const idx = history.length; // index of the new entry

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
        h.map((e, i) => (i === idx ? { ...e, provider, model, summariesUsed } : e))
      );

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        setHistory((h) =>
          h.map((e, i) => (i === idx ? { ...e, answer: e.answer + text } : e))
        );
      }
      setHistory((h) =>
        h.map((e, i) => (i === idx ? { ...e, streaming: false } : e))
      );
    } catch (err) {
      setAskError((err as Error).message);
      setHistory((h) =>
        h.map((e, i) => (i === idx ? { ...e, streaming: false } : e))
      );
    } finally {
      setAsking(false);
    }
  }, [anime, question, episode, asking, history]);

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

  const maxEp = anime?.episodes ?? 9999;
  const answerBoxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    answerBoxRef.current?.scrollTo({ top: answerBoxRef.current.scrollHeight });
  }, [history]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Shiori <span className="text-violet-400">栞</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Your bookmark knows where you are. Ask anything about the anime
            you&apos;re watching — answers stop at your episode, so you never
            get spoiled.
          </p>
        </div>
        {health && (
          <div className="shrink-0 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-400">
            {health.llm.provider === "anthropic" ? "🧠 Claude" : "🖥️ Ollama"}{" "}
            <span className="text-slate-500">· {health.llm.model}</span>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setShowResults(true)}
          placeholder={
            anime
              ? "Search a different anime…"
              : "Search an anime (e.g. Frieren, One Piece)…"
          }
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 placeholder-slate-500 outline-none focus:border-violet-500"
        />
        {searching && (
          <span className="absolute right-4 top-3.5 text-xs text-slate-500">
            searching…
          </span>
        )}
        {showResults && results.length > 0 && (
          <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            {results.map((a) => (
              <button
                key={a.id}
                onClick={() => selectAnime(a)}
                className="flex w-full items-center gap-3 border-b border-slate-800 px-4 py-2.5 text-left last:border-0 hover:bg-slate-800"
              >
                {a.coverImage.medium && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.coverImage.medium}
                    alt=""
                    className="h-12 w-9 rounded object-cover"
                  />
                )}
                <div className="min-w-0">
                  <div className="truncate font-medium">{displayTitle(a)}</div>
                  <div className="text-xs text-slate-500">
                    {[a.format, a.seasonYear, a.episodes ? `${a.episodes} eps` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected anime + episode */}
      {anime && (
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-4">
            {anime.coverImage.medium && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={anime.coverImage.medium}
                alt=""
                className="h-20 w-14 rounded-lg object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold">
                {displayTitle(anime)}
              </h2>
              <p className="text-xs text-slate-500">
                {[
                  anime.format,
                  anime.seasonYear,
                  anime.episodes ? `${anime.episodes} episodes` : "ongoing",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="mt-1 text-xs">
                {coverageLoading ? (
                  <span className="text-slate-500">checking episode summaries…</span>
                ) : coverage && coverage.total > 0 ? (
                  <span className="text-emerald-400">
                    ✓ {coverage.total} episode summaries found
                    {coverage.source ? ` (${coverage.source})` : ""}
                  </span>
                ) : (
                  <span className="text-amber-400">
                    ⚠ No episode summaries found — answers will be very limited
                  </span>
                )}
              </p>
            </div>
            <div className="shrink-0 text-center">
              <label className="block text-xs text-slate-500">I&apos;m on episode</label>
              <input
                type="number"
                min={1}
                max={maxEp}
                value={episode}
                onChange={(e) =>
                  setEpisode(
                    Math.max(1, Math.min(maxEp, parseInt(e.target.value || "1", 10)))
                  )
                }
                className="mt-1 w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-center text-lg font-semibold outline-none focus:border-violet-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Q&A */}
      {anime && (
        <div className="mt-6">
          <div ref={answerBoxRef} className="max-h-[50vh] space-y-4 overflow-y-auto">
            {history.map((qa, i) => (
              <div key={i}>
                <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-violet-600/90 px-4 py-2 text-sm">
                  {qa.question}
                </div>
                <div className="mt-2 w-fit max-w-[90%] rounded-2xl rounded-bl-sm border border-slate-800 bg-slate-900 px-4 py-3 text-sm leading-relaxed">
                  {qa.answer || (qa.streaming ? "…" : "")}
                  {qa.streaming && qa.answer && (
                    <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-violet-400 align-middle" />
                  )}
                  {!qa.streaming && qa.provider && qa.provider !== "none" && (
                    <div className="mt-2 border-t border-slate-800 pt-1.5 text-[11px] text-slate-500">
                      {qa.provider} · {qa.model} · grounded on {qa.summariesUsed}{" "}
                      episode {qa.summariesUsed === 1 ? "summary" : "summaries"} (eps
                      1–{episode})
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {askError && (
            <div className="mt-3 rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
              {askError}
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()}
              placeholder={`Ask about ${displayTitle(anime)} (up to ep ${episode})…`}
              disabled={asking}
              className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 placeholder-slate-500 outline-none focus:border-violet-500 disabled:opacity-50"
            />
            <button
              onClick={ask}
              disabled={asking || !question.trim()}
              className="rounded-xl bg-violet-600 px-5 py-3 font-medium transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {asking ? "…" : "Ask"}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            Questions like &quot;Who is X?&quot;, &quot;Why did Y happen?&quot;, or
            &quot;Does Z ever fight again?&quot; — spoiler-safe up to episode{" "}
            {episode}.
          </p>
        </div>
      )}

      {/* Community reactions */}
      {anime && (
        <div className="mt-8">
          {!commentsOpen ? (
            <button
              onClick={loadComments}
              className="w-full rounded-xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-3 text-sm text-slate-400 transition hover:border-violet-600 hover:text-slate-200"
            >
              💬 Show community reactions for episode {episode}{" "}
              <span className="text-amber-500">(may contain spoilers)</span>
            </button>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold">
                  Episode {episode} — community reactions
                </h3>
                <button
                  onClick={() => setCommentsOpen(false)}
                  className="text-xs text-slate-500 hover:text-slate-300"
                >
                  hide
                </button>
              </div>

              {commentsLoading && (
                <p className="text-sm text-slate-500">loading threads…</p>
              )}

              {!commentsLoading && comments && (
                <div className="space-y-4">
                  {/* MAL */}
                  <div>
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-sky-400">
                      MyAnimeList
                    </h4>
                    {comments.mal ? (
                      <a
                        href={comments.mal.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm transition hover:border-sky-700"
                      >
                        <span className="text-sky-300">{comments.mal.title}</span>
                        <span className="ml-2 text-xs text-slate-500">
                          {comments.mal.comments != null
                            ? `${comments.mal.comments} comments — `
                            : ""}
                          open thread ↗
                        </span>
                      </a>
                    ) : (
                      <p className="text-sm text-slate-500">
                        No MAL episode discussion found.
                        {comments.malError ? ` (${comments.malError})` : ""}
                      </p>
                    )}
                  </div>

                  {/* Reddit */}
                  <div>
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-orange-400">
                      Reddit r/anime
                    </h4>
                    {!comments.redditEnabled ? (
                      <p className="text-sm text-slate-500">
                        Reddit is off — add{" "}
                        <code className="rounded bg-slate-800 px-1">
                          REDDIT_CLIENT_ID
                        </code>{" "}
                        and{" "}
                        <code className="rounded bg-slate-800 px-1">
                          REDDIT_CLIENT_SECRET
                        </code>{" "}
                        to <code className="rounded bg-slate-800 px-1">.env.local</code>{" "}
                        and it activates automatically.
                      </p>
                    ) : comments.reddit ? (
                      <div>
                        <a
                          href={comments.reddit.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-orange-300 hover:underline"
                        >
                          {comments.reddit.title} ↗
                        </a>
                        <div className="mt-2 space-y-2">
                          {comments.reddit.comments.map((c, i) => (
                            <div
                              key={i}
                              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
                            >
                              <div className="mb-1 text-xs text-slate-500">
                                u/{c.author} · {c.score} points
                              </div>
                              <div className="whitespace-pre-wrap text-slate-300">
                                {c.body}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">
                        No matching Reddit discussion thread found.
                        {comments.redditError ? ` (${comments.redditError})` : ""}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!anime && (
        <div className="mt-16 text-center text-sm text-slate-600">
          <p>Pick an anime and the episode you&apos;re on to get started.</p>
          <p className="mt-1">
            Answers are grounded only on episodes you&apos;ve already seen — the
            model literally never sees what comes after.
          </p>
        </div>
      )}
    </main>
  );
}
