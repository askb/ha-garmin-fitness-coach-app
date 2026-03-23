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
 * Returns the first agent ID found, or null if none available.
 */
async function discoverAgent(token: string): Promise<string | null> {
  try {
    const response = await fetch(`${SUPERVISOR_URL}/conversation/agent/list`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      agents?: Record<string, { name: string }>;
    };
    if (!data.agents) return null;
    // Return first non-homeassistant agent (prefer Claude/Gemini over built-in)
    const agents = Object.entries(data.agents);
    const external = agents.find(([id]) => id !== "homeassistant");
    return external?.[0] ?? agents[0]?.[0] ?? null;
  } catch {
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

  const timeoutMs = options?.timeoutMs ?? 120_000;
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
