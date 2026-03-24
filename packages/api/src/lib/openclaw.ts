// ---------------------------------------------------------------------------
// openclaw.ts — HA Conversation Agent client
// ---------------------------------------------------------------------------
// Uses the HA Supervisor REST API to send prompts to any configured
// conversation agent (Claude, Gemini, etc.) via conversation/process.
//
// Requires: homeassistant_api: true in addon config.json
// Environment: SUPERVISOR_TOKEN (auto-injected by HA Supervisor)
//              OPENCLAW_AGENT_ID (from addon options or env — optional)
// ---------------------------------------------------------------------------

export interface OpenClawOptions {
  agentId?: string;
  timeoutMs?: number;
}

const SUPERVISOR_URL = "http://supervisor/core/api";

/**
 * Auto-discover available conversation agents from HA.
 * Uses config_entries API (agent/list doesn't exist in all HA versions).
 * Prefers Google AI / Gemini over OpenClaw (which causes OOM on RPi4).
 */
async function discoverAgent(token: string): Promise<string | null> {
  try {
    // Primary: discover via config entries (works on all HA versions)
    const response = await fetch(`${SUPERVISOR_URL}/config/config_entries/entry`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      console.log(`[AI] Config entries API returned ${response.status}`);
      return null;
    }
    const entries = (await response.json()) as Array<{
      domain: string;
      title: string;
      entry_id: string;
    }>;

    // Find conversation-capable integrations
    const CONVERSATION_DOMAINS = [
      "google_generative_ai_conversation",
      "openai_conversation",
      "anthropic",
    ];
    // OpenClaw uses ~550MB idle and spikes to 1.5GB+ on prompts → OOM on RPi4
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
      console.log(`[AI] Using Google AI: ${googleAgent.entry_id} (${googleAgent.title})`);
      return googleAgent.entry_id;
    }

    // Next: OpenAI or Anthropic
    const cloudAgent = conversationAgents.find(
      (e) => e.domain.includes("openai") || e.domain.includes("anthropic"),
    );
    if (cloudAgent) {
      console.log(`[AI] Using cloud agent: ${cloudAgent.entry_id} (${cloudAgent.title})`);
      return cloudAgent.entry_id;
    }

    // Last resort: any non-skipped conversation agent
    if (conversationAgents.length > 0) {
      const agent = conversationAgents[0]!;
      console.log(`[AI] Using fallback agent: ${agent.entry_id} (${agent.title})`);
      return agent.entry_id;
    }

    console.log("[AI] No conversation agents found — will use HA default");
    return null;
  } catch (err) {
    console.error("[AI] Agent discovery failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// Cache discovered agent ID
let _cachedAgentId: string | null = null;

/**
 * Send a prompt to the HA conversation agent and return the text response.
 */
export async function openclawChat(
  prompt: string,
  options?: OpenClawOptions,
): Promise<string> {
  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) {
    throw new Error("No SUPERVISOR_TOKEN — not running inside HA addon");
  }

  // Determine agent ID: explicit > env > cached discovery > discover now
  let agentId = options?.agentId ?? process.env.OPENCLAW_AGENT_ID;

  // If the default hardcoded value, treat as "not configured" and auto-discover
  if (!agentId || agentId === "01KJ1JD2A3GHH2HP4B6DN6MVJ5") {
    if (!_cachedAgentId) {
      _cachedAgentId = await discoverAgent(token);
      if (_cachedAgentId) {
        console.log(`[AI] Auto-discovered conversation agent: ${_cachedAgentId}`);
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

    console.log(`[AI] Calling HA Conversation API${agentId ? ` (agent: ${agentId})` : " (default agent)"}...`);

    const response = await fetch(
      `${SUPERVISOR_URL}/conversation/process`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.error(`[AI] HA Conversation error ${response.status}: ${errBody.slice(0, 300)}`);
      throw new Error(`HA Conversation error ${response.status}: ${errBody.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      response?: {
        speech?: { plain?: { speech?: string } };
      };
    };

    const text = data.response?.speech?.plain?.speech;
    if (!text) {
      console.error("[AI] HA Conversation returned empty response:", JSON.stringify(data).slice(0, 300));
      throw new Error("HA Conversation returned empty response");
    }

    console.log(`[AI] Got response (${text.length} chars)`);
    return text;
  } finally {
    clearTimeout(timer);
  }
}
