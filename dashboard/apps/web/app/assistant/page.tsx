"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import {
  ASSISTANT_GREETING,
  ASSISTANT_MODEL,
  ASSISTANT_NEW_CHAT,
  ASSISTANT_SUGGESTIONS,
  assistantAnswer,
  type ChatMessage,
} from "@/lib/mock";

export default function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: ASSISTANT_GREETING },
  ]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function send(text: string) {
    const question = text.trim();
    if (!question || thinking) return;

    setMessages((current) => [...current, { role: "user", text: question }]);
    setDraft("");
    setThinking(true);

    timer.current = setTimeout(() => {
      setMessages((current) => [
        ...current,
        { role: "assistant", text: assistantAnswer(question, ASSISTANT_MODEL) },
      ]);
      setThinking(false);
    }, 900);
  }

  function newChat() {
    if (timer.current) clearTimeout(timer.current);
    setMessages([{ role: "assistant", text: ASSISTANT_NEW_CHAT }]);
    setDraft("");
    setThinking(false);
  }

  return (
    <>
      <PageHeader title="AI Assistant" sub="Ask questions about your stack in plain language." />

      <section
        aria-label="AI Assistant"
        className="flex min-h-[600px] flex-col rounded-[14px] border border-border bg-card"
      >
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-[8px] bg-brand-soft text-brand-text">
              <Sparkles className="size-[17px]" strokeWidth={1.9} aria-hidden="true" />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold">Stack Assistant</span>
              <span className="text-xs text-muted-foreground">
                {ASSISTANT_MODEL} via Ollama · reads Jenkins, SonarQube and container logs
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={newChat}
            className="h-9 rounded-[8px] border border-border2 bg-card2 px-3 text-[13px] font-semibold text-fg2"
          >
            New chat
          </button>
        </div>

        <div
          aria-live="polite"
          className="flex max-h-[520px] flex-1 flex-col gap-3.5 overflow-y-auto p-5"
        >
          {messages.map((message, i) => {
            const mine = message.role === "user";

            return (
              <div
                key={`${message.role}-${i}`}
                className={mine ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={
                    mine
                      ? "max-w-[min(640px,85%)] rounded-[14px] rounded-br-[4px] bg-brand px-4 py-3 text-sm font-medium leading-[1.55] text-brand-foreground"
                      : "max-w-[min(640px,85%)] rounded-[14px] rounded-bl-[4px] border border-border2 bg-card2 px-4 py-3 text-sm leading-[1.55] text-foreground"
                  }
                >
                  {message.text}
                </div>
              </div>
            );
          })}

          {thinking && (
            <div className="flex">
              <div className="animate-[dcpulse_1.2s_infinite] rounded-[14px] bg-card2 px-4 py-3 text-[13px] text-muted-foreground">
                Checking your stack…
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2.5 border-t border-border px-5 pb-5 pt-3.5">
          <div className="flex flex-wrap gap-2">
            {ASSISTANT_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => send(suggestion)}
                className="h-[34px] rounded-full border border-border2 bg-card2 px-3 text-xs text-fg2"
              >
                {suggestion}
              </button>
            ))}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              send(draft);
            }}
            className="flex gap-2.5"
          >
            <input
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask about builds, health, logs…"
              autoComplete="off"
              aria-label="Ask the assistant"
              className="h-[46px] min-w-0 flex-1 rounded-[10px] border border-border2 bg-field px-3.5 text-sm text-foreground outline-none"
            />
            <button
              type="submit"
              aria-label="Send"
              className="grid size-[46px] place-items-center rounded-[10px] bg-brand text-brand-foreground"
            >
              <Send className="size-[18px]" strokeWidth={2.2} aria-hidden="true" />
            </button>
          </form>
        </div>
      </section>
    </>
  );
}
