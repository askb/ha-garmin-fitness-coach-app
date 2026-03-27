import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { desc, eq } from "@acme/db";
import { ChatMessage } from "@acme/db/schema";

import type { AgentType } from "../lib/agent-prompts";
import type { OllamaMessage } from "../lib/ollama";
import { getAgentPrompt } from "../lib/agent-prompts";
import { buildDataContext } from "../lib/data-context";
import { ollamaChat } from "../lib/ollama";
import { openclawChat } from "../lib/openclaw";
import { protectedProcedure } from "../trpc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AGENT_LABELS: Record<AgentType, string> = {
  "sport-scientist": "Sport Scientist",
  psychologist: "Sport Psychologist",
  nutritionist: "Nutritionist",
  recovery: "Recovery Specialist",
};

// Mutex: only 1 AI request at a time to prevent OOM on low-memory devices
let _aiInFlight = false;
let _aiAbortController: AbortController | null = null;

const AI_TIMEOUT_MS = 45_000; // 45s — HA Conversation API on RPi4 can be slow

/**
 * Quick data-driven fallback when Ollama is unreachable.
 * Extracts a few key points from the data context so the user still gets
 * something useful.
 */
function generateFallbackResponse(
  userMessage: string,
  dataContext: string,
): string {
  const lines: string[] = [];
  lines.push(
    "The AI service is temporarily unavailable. Here's a summary of your current data:\n",
  );

  // Pull key sections from the data context
  for (const section of dataContext.split("\n\n")) {
    const header = section.split("\n")[0];
    if (header) lines.push(section);
  }

  lines.push(
    "\n_Try again in a moment for a full AI-powered analysis of your question._",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const chatRouter = {
  getHistory: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      const messages = await ctx.db.query.ChatMessage.findMany({
        where: eq(ChatMessage.userId, ctx.session.user.id),
        orderBy: desc(ChatMessage.createdAt),
        limit: input.limit,
      });
      return messages.reverse();
    }),

  sendMessage: protectedProcedure
    .input(
      z.object({
        content: z.string().min(1).max(2000),
        agent: z
          .enum(["sport-scientist", "psychologist", "nutritionist", "recovery"])
          .default("sport-scientist"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Cancel any in-flight AI request (prevents OOM from retries)
      if (_aiInFlight && _aiAbortController) {
        console.log("[Chat] Cancelling previous AI request");
        _aiAbortController.abort();
      }

      // Guard: reject if another request is still running
      if (_aiInFlight) {
        return {
          id: "busy",
          userId,
          role: "assistant" as const,
          content:
            "⏳ Still processing your previous question. Please wait a moment...",
          context: { agent: input.agent },
          createdAt: new Date(),
        };
      }

      _aiInFlight = true;
      _aiAbortController = new AbortController();

      try {
        // 1. Save user message
        await ctx.db.insert(ChatMessage).values({
          userId,
          role: "user",
          content: input.content,
          context: { agent: input.agent },
        });

        // 2. Build data context from real Garmin data
        const dataContext = await buildDataContext(ctx.db, userId);

        // 3. Get agent-specific system prompt (trimmed for low-memory devices)
        const systemPrompt = getAgentPrompt(input.agent);

        // 4. Get recent chat history (last 5 messages — reduced from 10 for memory)
        const history = await ctx.db.query.ChatMessage.findMany({
          where: eq(ChatMessage.userId, userId),
          orderBy: desc(ChatMessage.createdAt),
          limit: 5,
        });

        // 5. Call AI backend: OpenClaw (HA) → Ollama → fallback
        let responseContent: string;
        const fullPrompt = `${systemPrompt}\n\n## Current Athlete Data\n${dataContext}\n\n## User Question\n${input.content}`;

        console.log(
          `[Chat] Prompt size: ${fullPrompt.length} chars, data context: ${dataContext.length} chars`,
        );

        try {
          responseContent = await openclawChat(fullPrompt, {
            timeoutMs: AI_TIMEOUT_MS,
          });
        } catch (e) {
          console.error(
            `[Chat] OpenClaw failed:`,
            e instanceof Error ? e.message : e,
          );
          try {
            const ollamaMessages: OllamaMessage[] = [
              {
                role: "system",
                content: `${systemPrompt}\n\n## Current Athlete Data\n${dataContext}`,
              },
              ...history.reverse().map((m) => ({
                role: m.role as "user" | "assistant",
                content: m.content,
              })),
            ];
            responseContent = await ollamaChat(ollamaMessages, {
              temperature: 0.7,
              timeoutMs: AI_TIMEOUT_MS,
            });
          } catch (e2) {
            console.error(
              `[Chat] Ollama also failed:`,
              e2 instanceof Error ? e2.message : e2,
            );
            responseContent = `⚠️ AI service unavailable. Falling back to data summary:\n\n${generateFallbackResponse(input.content, dataContext)}`;
          }
        }

        // 6. Append medical disclaimer
        const disclaimer =
          "\n\n---\n*⚠️ Disclaimer: This is AI-generated guidance, not professional medical advice. " +
          "Individual results may vary. Consult a qualified healthcare professional " +
          "for personalized advice, especially if you have pre-existing health conditions.*";
        responseContent += disclaimer;

        // 7. Save assistant response
        const agentLabel = AGENT_LABELS[input.agent];
        const [assistantMsg] = await ctx.db
          .insert(ChatMessage)
          .values({
            userId,
            role: "assistant",
            content: responseContent,
            context: { agent: input.agent, agentLabel },
          })
          .returning();

        if (!assistantMsg) throw new Error("Failed to save assistant message");
        return { ...assistantMsg, agent: input.agent };
      } finally {
        _aiInFlight = false;
        _aiAbortController = null;
      }
    }),

  clearHistory: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .delete(ChatMessage)
      .where(eq(ChatMessage.userId, ctx.session.user.id));
    return { success: true };
  }),
} satisfies TRPCRouterRecord;
