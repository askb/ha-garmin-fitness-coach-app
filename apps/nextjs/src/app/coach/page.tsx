"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { cn } from "@acme/ui";

import { useTRPC } from "~/trpc/react";

// ---------------------------------------------------------------------------
// Quick Actions
// ---------------------------------------------------------------------------

const QUICK_ACTIONS = [
  { label: "How am I today?", message: "How is my readiness today?" },
  { label: "Training advice", message: "What should my training look like today?" },
  { label: "Sleep analysis", message: "How has my sleep been recently?" },
  { label: "Recovery status", message: "How recovered am I?" },
] as const;

// ---------------------------------------------------------------------------
// Message Component
// ---------------------------------------------------------------------------

function ChatBubble({
  role,
  content,
  createdAt,
}: {
  role: string;
  content: string;
  createdAt: string | Date;
}) {
  const isUser = role === "user";
  const time = new Date(createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%] space-y-1")}>
        {!isUser && (
          <span className="text-xs font-medium text-zinc-400">🏋️ Coach</span>
        )}
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isUser
              ? "bg-indigo-600 text-white"
              : "bg-zinc-700 text-zinc-100",
          )}
        >
          {content.split("**").map((segment, i) =>
            i % 2 === 1 ? (
              <strong key={i} className="font-semibold">
                {segment}
              </strong>
            ) : (
              <span key={i}>{segment}</span>
            ),
          )}
        </div>
        <p
          className={cn(
            "text-[10px] text-zinc-500",
            isUser ? "text-right" : "text-left",
          )}
        >
          {time}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CoachPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const history = useQuery(
    trpc.chat.getHistory.queryOptions({ limit: 50 }),
  );

  const sendMutation = useMutation(
    trpc.chat.sendMessage.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: trpc.chat.getHistory.queryKey(),
        });
      },
    }),
  );

  const clearMutation = useMutation(
    trpc.chat.clearHistory.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: trpc.chat.getHistory.queryKey(),
        });
        setShowClearConfirm(false);
      },
    }),
  );

  const messages = history.data ?? [];

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, sendMutation.isPending]);

  function handleSend(text?: string) {
    const content = (text ?? input).trim();
    if (!content || sendMutation.isPending) return;
    setInput("");
    sendMutation.mutate({ content });
  }

  return (
    <div className="flex h-dvh flex-col bg-zinc-950">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            ← Back
          </Link>
          <div>
            <h1 className="text-base font-semibold text-zinc-100">
              🏋️ AI Coach
            </h1>
            <p className="text-xs text-zinc-500">
              Powered by your Garmin data
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowClearConfirm(true)}
          className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
        >
          Clear
        </button>
      </header>

      {/* Clear confirmation dialog */}
      {showClearConfirm && (
        <div className="border-b border-zinc-800 bg-zinc-900/80 px-4 py-3">
          <p className="text-sm text-zinc-300">Clear all chat history?</p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => clearMutation.mutate()}
              disabled={clearMutation.isPending}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              {clearMutation.isPending ? "Clearing…" : "Yes, clear"}
            </button>
            <button
              onClick={() => setShowClearConfirm(false)}
              className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !history.isLoading ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-4xl">👋</p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-zinc-400">
              I&apos;m your AI Sport Scientist Coach. Ask me anything about your
              training, recovery, sleep, or readiness. I use your actual Garmin
              data to give personalized advice.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <ChatBubble
                key={msg.id}
                role={msg.role}
                content={msg.content}
                createdAt={msg.createdAt}
              />
            ))}
            {sendMutation.isPending && (
              <div className="flex justify-start">
                <div className="max-w-[85%] space-y-1">
                  <span className="text-xs font-medium text-zinc-400">
                    🏋️ Coach
                  </span>
                  <div className="rounded-2xl bg-zinc-700 px-4 py-3 text-sm text-zinc-300">
                    <span className="inline-flex gap-1">
                      <span className="animate-bounce">●</span>
                      <span className="animate-bounce [animation-delay:0.15s]">●</span>
                      <span className="animate-bounce [animation-delay:0.3s]">●</span>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      {messages.length === 0 && !history.isLoading && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              onClick={() => handleSend(action.message)}
              disabled={sendMutation.isPending}
              className="shrink-0 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 transition-colors"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-zinc-800 bg-zinc-900 px-4 py-3 pb-safe">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask your coach…"
            disabled={sendMutation.isPending}
            className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || sendMutation.isPending}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
