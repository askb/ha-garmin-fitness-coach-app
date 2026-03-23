import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { desc, eq } from "@acme/db";
import { ChatMessage } from "@acme/db/schema";

import { protectedProcedure } from "../trpc";
import { ollamaChat } from "../lib/ollama";
import type { OllamaMessage } from "../lib/ollama";
import { openclawChat } from "../lib/openclaw";
import { getAgentPrompt } from "../lib/agent-prompts";
import type { AgentType } from "../lib/agent-prompts";
import { buildDataContext } from "../lib/data-context";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AGENT_LABELS: Record<AgentType, string> = {
  "sport-scientist": "Sport Scientist",
  psychologist: "Sport Psychologist",
  nutritionist: "Nutritionist",
  recovery: "Recovery Specialist",
};

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

      // 1. Save user message
      await ctx.db.insert(ChatMessage).values({
        userId,
        role: "user",
        content: input.content,
        context: { agent: input.agent },
      });

      // 2. Build data context from real Garmin data
      const dataContext = await buildDataContext(ctx.db, userId);

      // 3. Get agent-specific system prompt
      const systemPrompt = getAgentPrompt(input.agent);

      // 4. Get recent chat history (last 10 messages for conversational context)
      const history = await ctx.db.query.ChatMessage.findMany({
        where: eq(ChatMessage.userId, userId),
        orderBy: desc(ChatMessage.createdAt),
        limit: 10,
      });

      // 5. Call AI backend: OpenClaw (HA) → Ollama → fallback
      let responseContent: string;
      const fullPrompt = `${systemPrompt}\n\n## Current Athlete Data\n${dataContext}\n\n## User Question\n${input.content}`;

      try {
        // Try OpenClaw via HA Supervisor API first (zero config if running in HA)
        responseContent = await openclawChat(fullPrompt);
      } catch {
        // Fall back to Ollama
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
          });
        } catch {
          responseContent = `⚠️ AI service unavailable. Falling back to data summary:\n\n${generateFallbackResponse(input.content, dataContext)}`;
        }
      }

      // 6. Save assistant response
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

      return { ...assistantMsg!, agent: input.agent };
    }),

  clearHistory: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .delete(ChatMessage)
      .where(eq(ChatMessage.userId, ctx.session.user.id));
    return { success: true };
  }),
} satisfies TRPCRouterRecord;
