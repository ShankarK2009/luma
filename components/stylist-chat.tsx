"use client";

import { useState } from "react";
import { LoaderCircle, Send } from "lucide-react";

import type { StylistMessage } from "@/lib/types";
import { titleCase } from "@/lib/utils";

async function readErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? "I could not reach the stylist backend right now.";
  } catch {
    return "I could not reach the stylist backend right now.";
  }
}

export function StylistChat({
  threadId,
  initialMessages,
}: {
  threadId: string;
  initialMessages: StylistMessage[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState(threadId);

  const getOutfitItemsFromMessage = (message: StylistMessage) => {
    const generateOutfitCall = message.toolCalls.find(
      (call) => call.name === "generateOutfit",
    );

    if (
      !generateOutfitCall ||
      typeof generateOutfitCall.result !== "object" ||
      !generateOutfitCall.result ||
      !("primaryItems" in generateOutfitCall.result)
    ) {
      return [];
    }

    const rawItems = (generateOutfitCall.result as { primaryItems?: unknown }).primaryItems;
    if (!Array.isArray(rawItems)) {
      return [];
    }

    return rawItems
      .filter((entry) => typeof entry === "object" && entry !== null)
      .map((entry) => {
        const item = entry as {
          id?: string;
          name?: string;
          category?: string;
          colors?: string[];
        };
        return {
          id: item.id ?? crypto.randomUUID(),
          name: item.name ?? "Wardrobe item",
          category: item.category ?? "item",
          colors: Array.isArray(item.colors) ? item.colors : [],
        };
      });
  };

  const handleSubmit = async () => {
    if (!draft.trim()) return;

    const nextUserMessage: StylistMessage = {
      id: crypto.randomUUID(),
      threadId: activeThreadId,
      role: "user",
      content: draft,
      toolCalls: [],
      createdAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, nextUserMessage]);
    setDraft("");
    setBusy(true);

    try {
      const response = await fetch("/api/stylist/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          threadId: activeThreadId,
          message: nextUserMessage.content,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as {
        threadId: string;
        message: StylistMessage;
      };

      setActiveThreadId(payload.threadId);
      setMessages((current) => [...current, payload.message]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          threadId: activeThreadId,
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "I could not reach the stylist backend right now.",
          toolCalls: [],
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[28rem] flex-col gap-4">
      <div className="flex flex-1 flex-col gap-3 rounded-[2rem] border border-white/12 bg-white/6 p-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[86%] rounded-[1.4rem] px-4 py-3 text-sm leading-6 ${
              message.role === "assistant"
                ? "self-start bg-white/10 text-[var(--text-strong)]"
                : "self-end bg-[var(--accent)] text-[var(--accent-ink)]"
            }`}
          >
            {message.content}
            {message.role === "assistant" ? (
              (() => {
                const outfitItems = getOutfitItemsFromMessage(message);
                if (!outfitItems.length) {
                  return null;
                }

                return (
                  <div className="mt-3 grid gap-2">
                    {outfitItems.map((item) => (
                      <article
                        key={item.id}
                        className="rounded-2xl border border-white/15 bg-black/15 p-3"
                      >
                        <p className="text-sm font-semibold text-[var(--text-strong)]">{item.name}</p>
                        <p className="text-[0.68rem] uppercase tracking-[0.2em] text-[var(--text-soft)]">
                          {titleCase(item.category)}
                        </p>
                        {item.colors.length ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {item.colors.slice(0, 3).map((color) => (
                              <span
                                key={`${item.id}-${color}`}
                                className="rounded-full border border-white/10 px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.16em] text-[var(--text-soft)]"
                              >
                                {color}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                );
              })()
            ) : null}
          </div>
        ))}

        {busy ? (
          <div className="self-start rounded-[1.4rem] bg-white/10 px-4 py-3 text-sm text-[var(--text-soft)]">
            <LoaderCircle className="h-4 w-4 animate-spin" />
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {["What is my style?", "Remix my blazer", "Date-night look", "Cozy but polished"].map(
            (prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setDraft(prompt)}
                className="rounded-full border border-white/12 px-3 py-2 text-xs text-[var(--text-soft)] transition hover:bg-white/8 hover:text-[var(--text-strong)]"
              >
                {prompt}
              </button>
            ),
          )}
        </div>

        <div className="flex items-end gap-3 rounded-[1.7rem] border border-white/12 bg-black/12 px-4 py-3">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask Luma for styling help..."
            className="min-h-16 flex-1 resize-none bg-transparent text-sm text-[var(--text-strong)] outline-none placeholder:text-[var(--text-soft)]"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void handleSubmit();
            }}
            className="rounded-full bg-[var(--accent)] p-3 text-[var(--accent-ink)] disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
