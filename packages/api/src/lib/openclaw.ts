// ---------------------------------------------------------------------------
// OpenClaw / HA Conversation Agent client
// ---------------------------------------------------------------------------
// Uses the HA Supervisor API to send prompts to OpenClaw (or any configured
// conversation agent) via the conversation.process service.
//
// Requires: homeassistant_api: true in addon config.json
// Environment: SUPERVISOR_TOKEN (auto-injected by HA Supervisor)
//              OPENCLAW_AGENT_ID (from addon options or env)
// ---------------------------------------------------------------------------

export interface OpenClawOptions {
  agentId?: string;
  timeoutMs?: number;
}

const DEFAULT_AGENT_ID = "01KJ1JD2A3GHH2HP4B6DN6MVJ5";
const SUPERVISOR_URL = "http://supervisor/core/api";

/**
 * Send a prompt to the HA conversation agent (OpenClaw) and return the text
 * response. Falls back gracefully if SUPERVISOR_TOKEN is not available
 * (e.g., running in dev mode outside HA).
 */
export async function openclawChat(
  prompt: string,
  options?: OpenClawOptions,
): Promise<string> {
  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) {
    throw new Error("No SUPERVISOR_TOKEN — not running inside HA addon");
  }

  const agentId =
    options?.agentId ??
    process.env.OPENCLAW_AGENT_ID ??
    DEFAULT_AGENT_ID;
  const timeoutMs = options?.timeoutMs ?? 120_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `${SUPERVISOR_URL}/services/conversation/process`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          agent_id: agentId,
          text: prompt,
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `OpenClaw error ${response.status}: ${body.slice(0, 200)}`,
      );
    }

    const data = (await response.json()) as {
      response?: {
        speech?: { plain?: { speech?: string } };
      };
    };

    const text = data.response?.speech?.plain?.speech;
    if (!text) {
      throw new Error("OpenClaw returned empty response");
    }

    return text;
  } finally {
    clearTimeout(timer);
  }
}
