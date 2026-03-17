"use client";

import { useEffect, useRef, useState } from "react";
import { IngressLink as Link } from "~/app/_components/ingress-link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { cn } from "@acme/ui";

import { useTRPC } from "~/trpc/react";

// ---------------------------------------------------------------------------
// Agent configuration
// ---------------------------------------------------------------------------

type AgentType = "sport-scientist" | "psychologist" | "nutritionist" | "recovery";

interface AgentConfig {
  id: AgentType;
  label: string;
  icon: string;
  accent: string;       // tailwind text color
  accentBg: string;     // tailwind bg color for buttons
  accentBorder: string; // tailwind border color
  welcome: string;
  quickActions: readonly { label: string; message: string }[];
}

const AGENTS: AgentConfig[] = [
  {
    id: "sport-scientist",
    label: "Sport Scientist",
    icon: "🏋️",
    accent: "text-blue-400",
    accentBg: "bg-blue-600 hover:bg-blue-500",
    accentBorder: "border-blue-500",
    welcome:
      "I'm your Sport Scientist. I analyze training loads, zone distribution, ACWR, and VO2max trends to optimize your performance. Ask me anything about your training.",
    quickActions: [
      { label: "Am I overtraining?", message: "Am I overtraining? Analyze my ACWR and training load." },
      { label: "Zone distribution", message: "Analyze my heart rate zone distribution over the last 30 days." },
      { label: "Race prep for 10K", message: "How should I prepare for a 10K race based on my current fitness?" },
      { label: "Training advice", message: "What should my training look like today based on my readiness?" },
    ],
  },
  {
    id: "psychologist",
    label: "Psychologist",
    icon: "🧠",
    accent: "text-purple-400",
    accentBg: "bg-purple-600 hover:bg-purple-500",
    accentBorder: "border-purple-500",
    welcome:
      "I'm your Sport Psychologist. I help with motivation, mental resilience, and performance psychology. Let's work on the mental side of your training.",
    quickActions: [
      { label: "Losing motivation", message: "I'm losing motivation to train. Can you help?" },
      { label: "Race day prep", message: "Help me with mental preparation for race day." },
      { label: "Stay consistent", message: "How can I stay more consistent with my training?" },
      { label: "Handle pressure", message: "How do I handle performance pressure and anxiety?" },
    ],
  },
  {
    id: "nutritionist",
    label: "Nutritionist",
    icon: "🥗",
    accent: "text-green-400",
    accentBg: "bg-green-600 hover:bg-green-500",
    accentBorder: "border-green-500",
    welcome:
      "I'm your Sports Nutritionist. I help with fueling strategies, recovery nutrition, and hydration based on your training demands.",
    quickActions: [
      { label: "Pre-workout fuel", message: "What should I eat before my workout?" },
      { label: "Recovery meals", message: "What are the best recovery meal suggestions after a hard session?" },
      { label: "Calorie needs", message: "What are my calorie and macro needs based on my current training load?" },
      { label: "Hydration plan", message: "Help me with a hydration strategy for my training." },
    ],
  },
  {
    id: "recovery",
    label: "Recovery",
    icon: "💤",
    accent: "text-teal-400",
    accentBg: "bg-teal-600 hover:bg-teal-500",
    accentBorder: "border-teal-500",
    welcome:
      "I'm your Recovery Specialist. I analyze sleep, HRV, stress, and body battery to keep you healthy and injury-free.",
    quickActions: [
      { label: "Enough sleep?", message: "Am I getting enough sleep? Analyze my sleep trends." },
      { label: "Deload week?", message: "Should I take a deload week based on my current data?" },
      { label: "Injury risk", message: "What's my current injury risk based on training load and recovery?" },
      { label: "Recovery tips", message: "Give me specific recovery protocols for today." },
    ],
  },
] as const;

function getAgentConfig(id: AgentType): AgentConfig {
  return AGENTS.find((a) => a.id === id)!;
}

// ---------------------------------------------------------------------------
// Markdown renderer (simple: bold, lists, headers)
// ---------------------------------------------------------------------------

function renderMarkdown(text: string) {
  const lines = text.split("\n");
  return lines.map((line, li) => {
    // Headers
    if (line.startsWith("### "))
      return (
        <h4 key={li} className="mt-3 mb-1 text-sm font-bold text-zinc-200">
          {renderInline(line.slice(4))}
        </h4>
      );
    if (line.startsWith("## "))
      return (
        <h3 key={li} className="mt-3 mb-1 text-sm font-bold text-zinc-100">
          {renderInline(line.slice(3))}
        </h3>
      );

    // Bullet lists
    if (/^[-•*] /.test(line))
      return (
        <li key={li} className="ml-4 list-disc text-sm leading-relaxed">
          {renderInline(line.replace(/^[-•*] /, ""))}
        </li>
      );

    // Numbered lists
    if (/^\d+\. /.test(line))
      return (
        <li key={li} className="ml-4 list-decimal text-sm leading-relaxed">
          {renderInline(line.replace(/^\d+\. /, ""))}
        </li>
      );

    // Empty line → spacer
    if (line.trim() === "") return <br key={li} />;

    // Normal paragraph
    return (
      <p key={li} className="text-sm leading-relaxed">
        {renderInline(line)}
      </p>
    );
  });
}

function renderInline(text: string) {
  // Bold **text** and _italic_
  return text.split(/(\*\*[^*]+\*\*|_[^_]+_)/).map((seg, i) => {
    if (seg.startsWith("**") && seg.endsWith("**"))
      return (
        <strong key={i} className="font-semibold">
          {seg.slice(2, -2)}
        </strong>
      );
    if (seg.startsWith("_") && seg.endsWith("_"))
      return (
        <em key={i} className="italic">
          {seg.slice(1, -1)}
        </em>
      );
    return <span key={i}>{seg}</span>;
  });
}

// ---------------------------------------------------------------------------
// Chat Bubble
// ---------------------------------------------------------------------------

function ChatBubble({
  role,
  content,
  createdAt,
  agentConfig,
}: {
  role: string;
  content: string;
  createdAt: string | Date;
  agentConfig: AgentConfig;
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
          <span className={cn("text-xs font-medium", agentConfig.accent)}>
            {agentConfig.icon} {agentConfig.label}
          </span>
        )}
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5",
            isUser
              ? "bg-indigo-600 text-white"
              : "bg-zinc-700 text-zinc-100",
          )}
        >
          {isUser ? (
            <p className="text-sm leading-relaxed">{content}</p>
          ) : (
            <div className="space-y-0.5">{renderMarkdown(content)}</div>
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
  const [activeAgent, setActiveAgent] = useState<AgentType>("sport-scientist");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const agentConfig = getAgentConfig(activeAgent);

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
    sendMutation.mutate({ content, agent: activeAgent });
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
              {agentConfig.icon} AI {agentConfig.label}
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

      {/* Agent Selector Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-zinc-800 bg-zinc-900/60 px-4 py-2">
        {AGENTS.map((agent) => (
          <button
            key={agent.id}
            onClick={() => setActiveAgent(agent.id)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              activeAgent === agent.id
                ? cn(agent.accentBg, "text-white")
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200",
            )}
          >
            {agent.icon} {agent.label}
          </button>
        ))}
      </div>

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
            <p className="text-4xl">{agentConfig.icon}</p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-zinc-400">
              {agentConfig.welcome}
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
                agentConfig={agentConfig}
              />
            ))}
            {sendMutation.isPending && (
              <div className="flex justify-start">
                <div className="max-w-[85%] space-y-1">
                  <span className={cn("text-xs font-medium", agentConfig.accent)}>
                    {agentConfig.icon} {agentConfig.label}
                  </span>
                  <div className="rounded-2xl bg-zinc-700 px-4 py-3 text-sm text-zinc-300">
                    <span className="mr-2">{agentConfig.label} is thinking…</span>
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
          {agentConfig.quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => handleSend(action.message)}
              disabled={sendMutation.isPending}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-50",
                agentConfig.accentBorder,
                "bg-zinc-800 text-zinc-300 hover:bg-zinc-700",
              )}
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
            placeholder={`Ask the ${agentConfig.label}…`}
            disabled={sendMutation.isPending}
            className={cn(
              "flex-1 rounded-xl border bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none disabled:opacity-50",
              `focus:${agentConfig.accentBorder}`,
              "border-zinc-700",
            )}
          />
          <button
            type="submit"
            disabled={!input.trim() || sendMutation.isPending}
            className={cn(
              "rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50",
              agentConfig.accentBg,
            )}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
