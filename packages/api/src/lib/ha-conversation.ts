// ---------------------------------------------------------------------------
// ha-conversation.ts — Home Assistant Conversation API client
// ---------------------------------------------------------------------------
// Uses the HA Supervisor REST API to send prompts to whichever conversation
// agent the user has configured in HA (Google Generative AI / Gemini,
// Anthropic / Claude, OpenAI, or the built-in Assist agent) via
// /api/conversation/process.
//
// Requires: homeassistant_api: true in addon config.json
// Environment: SUPERVISOR_TOKEN          — auto-injected by HA Supervisor
//              HA_CONVERSATION_AGENT_ID  — explicit agent override (optional)
//              OPENCLAW_AGENT_ID         — legacy env name, still honored
// ---------------------------------------------------------------------------

export interface HaConversationOptions {
  agentId?: string;
  timeoutMs?: number;
}

const SUPERVISOR_URL = "http://supervisor/core/api";

/**
 * Auto-discover available conversation agents from HA.
 * Uses config_entries API (agent/list doesn't exist in all HA versions).
 * Prefers cloud LLM agents (Gemini, Claude, OpenAI) over the built-in
 * Assist agent, which returns canned device-control phrases for prompts
 * that don't match an intent.
 */
async function discoverAgent(token: string): Promise<string | null> {
  try {
    // Primary: discover via config entries (works on all HA versions)
    const response = await fetch(
      `${SUPERVISOR_URL}/config/config_entries/entry`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );
    if (!response.ok) {
      console.log(`[AI] Config entries API returned ${response.status}`);
      return null;
    }
    const entries = (await response.json()) as {
      domain: string;
      title: string;
      entry_id: string;
    }[];

    // Find conversation-capable integrations
    const CONVERSATION_DOMAINS = [
      "google_generative_ai_conversation",
      "openai_conversation",
      "anthropic",
    ];
    // Legacy: openclaw add-on used ~550MB idle and spiked to 1.5GB+ on
    // prompts, OOM-killing the addon on RPi4. Keep it on the deny-list
    // so any leftover entry never gets auto-selected.
    const SKIP_DOMAINS = ["openclaw"];

    const conversationAgents = entries.filter(
      (e) =>
        CONVERSATION_DOMAINS.includes(e.domain) ||
        (e.domain.includes("conversation") && !SKIP_DOMAINS.includes(e.domain)),
    );

    console.log(
      `[AI] Conversation agents found: ${conversationAgents.map((e) => `${e.domain} (${e.title}) → ${e.entry_id}`).join(", ") || "none"}`,
    );

    // Prefer Google AI (cloud-only, no local memory impact)
    const googleAgent = conversationAgents.find((e) =>
      e.domain.includes("google"),
    );
    if (googleAgent) {
      console.log(
        `[AI] Using Google AI: ${googleAgent.entry_id} (${googleAgent.title})`,
      );
      return googleAgent.entry_id;
    }

    // Next: OpenAI or Anthropic
    const cloudAgent = conversationAgents.find(
      (e) => e.domain.includes("openai") || e.domain.includes("anthropic"),
    );
    if (cloudAgent) {
      console.log(
        `[AI] Using cloud agent: ${cloudAgent.entry_id} (${cloudAgent.title})`,
      );
      return cloudAgent.entry_id;
    }

    // Last resort: any non-skipped conversation agent
    if (conversationAgents.length > 0) {
      const agent = conversationAgents[0]!;
      console.log(
        `[AI] Using fallback agent: ${agent.entry_id} (${agent.title})`,
      );
      return agent.entry_id;
    }

    console.log("[AI] No conversation agents found — will use HA default");
    return null;
  } catch (err) {
    console.error(
      "[AI] Agent discovery failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// Cache discovered agent ID for a short window so a removed / rate-limited
// agent gets re-detected within a few minutes instead of being pinned
// forever (which silently falls through to the HA built-in Assist agent).
let _cachedAgentId: string | null = null;
let _cachedAgentIdAt = 0;
const AGENT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Canned strings the HA built-in Assist agent returns when no intent
// matches a free-form prompt. Treat these as a backend miss so the
// caller can fall through to Ollama or a deterministic response.
const HA_ASSIST_FALLBACK_PATTERNS: RegExp[] = [
  /as a voice assistant,? i can help you/i,
  /i can help you (with )?control(ling)? your (smart )?home/i,
  /sorry,?\s*i['']?\s*m? not (sure|able)/i,
  /i don['']?t know how to (answer|help with) that/i,
];

export function isHaAssistFallback(text: string): boolean {
  if (!text) return false;
  return HA_ASSIST_FALLBACK_PATTERNS.some((re) => re.test(text));
}

/**
 * Send a prompt to the HA conversation agent and return the text response.
 *
 * Throws if the HA built-in Assist agent answered with a canned device-
 * control fallback string — that means our system prompt was bypassed,
 * and the caller should fall through to a non-HA backend.
 */
export async function haConversationChat(
  prompt: string,
  options?: HaConversationOptions,
): Promise<string> {
  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) {
    throw new Error("No SUPERVISOR_TOKEN — not running inside HA addon");
  }

  // Determine agent ID: explicit > env > cached discovery > discover now.
  // Legacy OPENCLAW_AGENT_ID env is still honored for back-compat with
  // older addon installs.
  let agentId =
    options?.agentId ??
    process.env.HA_CONVERSATION_AGENT_ID ??
    process.env.OPENCLAW_AGENT_ID;

  // If the default hardcoded value, treat as "not configured" and auto-discover
  if (!agentId || agentId === "01KJ1JD2A3GHH2HP4B6DN6MVJ5") {
    const cacheExpired = Date.now() - _cachedAgentIdAt > AGENT_CACHE_TTL_MS;
    if (!_cachedAgentId || cacheExpired) {
      _cachedAgentId = await discoverAgent(token);
      _cachedAgentIdAt = Date.now();
      if (_cachedAgentId) {
        console.log(
          `[AI] Auto-discovered conversation agent: ${_cachedAgentId}`,
        );
      }
    }
    agentId = _cachedAgentId ?? undefined;
  }

  const timeoutMs = options?.timeoutMs ?? 45_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Build request body — omit agent_id to use HA default if none found
    const body: Record<string, string> = { text: prompt };
    if (agentId) body.agent_id = agentId;

    console.log(
      `[AI] Calling HA Conversation API${agentId ? ` (agent: ${agentId})` : " (default agent)"}...`,
    );

    const response = await fetch(`${SUPERVISOR_URL}/conversation/process`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.error(
        `[AI] HA Conversation error ${response.status}: ${errBody.slice(0, 300)}`,
      );
      throw new Error(
        `HA Conversation error ${response.status}: ${errBody.slice(0, 200)}`,
      );
    }

    const data = (await response.json()) as {
      response?: {
        speech?: { plain?: { speech?: string } };
      };
    };

    const text = data.response?.speech?.plain?.speech;
    if (!text) {
      console.error(
        "[AI] HA Conversation returned empty response:",
        JSON.stringify(data).slice(0, 300),
      );
      throw new Error("HA Conversation returned empty response");
    }

    // Built-in Assist fallback strings mean the configured LLM agent did
    // NOT answer — intent matcher took over and returned a canned phrase.
    // Invalidate the cached agent so the next call re-discovers, then
    // throw so the caller can route to Ollama / rules-based.
    if (isHaAssistFallback(text)) {
      console.warn(
        `[AI] HA returned built-in Assist fallback ("${text.slice(0, 80)}…") — invalidating agent cache and falling through`,
      );
      _cachedAgentId = null;
      _cachedAgentIdAt = 0;
      throw new Error("HA Conversation returned built-in Assist fallback");
    }

    console.log(`[AI] Got response (${text.length} chars)`);
    return text;
  } finally {
    clearTimeout(timer);
  }
}
