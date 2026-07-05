import { NextRequest, NextResponse } from "next/server";
import { getEpisodeSummaries } from "@/lib/wikipedia";
import { streamAnswer, resolveLLM, type ChatMessage } from "@/lib/llm";

export const maxDuration = 300;

interface AskBody {
  title: string;
  altTitle?: string | null;
  episode: number;
  question: string;
  /** Prior Q&A exchanges, for follow-up questions. */
  history?: { question: string; answer: string }[];
}

function buildSystemPrompt(
  title: string,
  episode: number,
  summaryBlock: string,
  coverageNote: string
): string {
  return `You are a spoiler-safe anime companion. The user is watching "${title}" and has ONLY seen up to and including episode ${episode}.

Below are plot summaries for episodes 1 through ${episode}. These summaries are the ENTIRE story as far as this conversation is concerned.

<episode_summaries>
${summaryBlock}
</episode_summaries>${coverageNote}

Absolute rules — the user's experience of the show depends on them:
1. Answer ONLY from the provided summaries. Never draw on your own knowledge of this anime, even if you know it well. Anything not in the summaries does not exist yet.
2. If the answer isn't in the summaries and it's something the story would likely reveal later, tease safely: tell them it's worth keeping watching, with ZERO specifics — no names, no events, no hints, no "it involves...", nothing that narrows the possibilities.
3. For "does X happen?" questions not answered by episodes 1–${episode}, do NOT confirm or deny — either answer is a spoiler. Say you can't answer that without spoiling and encourage them to keep watching.
4. If the answer genuinely isn't the kind of thing the show would reveal (production trivia, etc.), just say you don't have that information.
5. When you state a fact, cite the episode it came from, like "(episode 4)".
6. If the summaries seem thin or incomplete for this show, be upfront that your knowledge of it is limited rather than guessing.

Keep answers conversational and reasonably short. Never mention "summaries" or "provided context" to the user — speak as someone who has watched exactly episodes 1 through ${episode} and nothing more.`;
}

export async function POST(req: NextRequest) {
  let body: AskBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { title, altTitle, episode, question, history } = body;
  if (!title || !question || !Number.isFinite(episode) || episode < 1) {
    return NextResponse.json(
      { error: "title, episode (>=1) and question are required" },
      { status: 400 }
    );
  }

  const { source, episodes } = await getEpisodeSummaries(title, altTitle);
  // The spoiler boundary: only episodes 1..N ever reach the model.
  const bounded = episodes.filter((e) => e.episode >= 1 && e.episode <= episode);

  const meta = {
    "X-Provider": "none",
    "X-Model": "none",
    "X-Summaries-Used": String(bounded.length),
    "X-Summaries-Total": String(episodes.length),
    "X-Source": encodeURIComponent(source ?? ""),
  };

  if (bounded.length === 0) {
    const msg =
      `I couldn't find per-episode summaries for "${title}", so I can't answer safely without risking spoilers. ` +
      `This usually happens with newer or more obscure shows that don't have a Wikipedia episode list yet. ` +
      `Rather than guess from general knowledge (which could leak later events), I'll stay quiet on this one.`;
    return new NextResponse(msg, {
      headers: { "Content-Type": "text/plain; charset=utf-8", ...meta },
    });
  }

  const summaryBlock = bounded
    .map(
      (e) =>
        `Episode ${e.episode}${e.title ? ` — "${e.title}"` : ""}:\n${e.summary}`
    )
    .join("\n\n");

  const coverageNote =
    bounded.length < episode
      ? `\n\nNote: summaries were only found for ${bounded.length} of the ${episode} episodes the user has watched. Be honest about limited information if relevant.`
      : "";

  // Fold prior exchanges in as real conversation turns so follow-up
  // questions ("what about her master?") resolve correctly. Capped to
  // keep the prompt bounded on slow local models.
  const messages: ChatMessage[] = [];
  for (const h of (history ?? []).slice(-6)) {
    if (!h?.question || !h?.answer) continue;
    messages.push({ role: "user", content: String(h.question).slice(0, 2000) });
    messages.push({ role: "assistant", content: String(h.answer).slice(0, 4000) });
  }
  messages.push({ role: "user", content: question });

  try {
    const { info, stream } = streamAnswer(
      buildSystemPrompt(title, episode, summaryBlock, coverageNote),
      messages
    );
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        ...meta,
        "X-Provider": info.provider,
        "X-Model": encodeURIComponent(info.model),
      },
    });
  } catch (err) {
    const info = resolveLLM();
    return NextResponse.json(
      {
        error: (err as Error).message,
        provider: info.provider,
        model: info.model,
      },
      { status: 502 }
    );
  }
}
