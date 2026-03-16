// ---------------------------------------------------------------------------
// Ollama chat client — zero-dependency, uses native fetch
// ---------------------------------------------------------------------------

export interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OllamaChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Fetch timeout in milliseconds (default 120 000 — 2 min) */
  timeoutMs?: number;
}

/**
 * Send a multi-turn chat request to a local Ollama instance and return the
 * assistant's reply as a plain string.
 *
 * Environment variables:
 *   OLLAMA_URL   – base URL  (default http://localhost:11434)
 *   OLLAMA_MODEL – model tag (default gpt-oss:20b)
 */
export async function ollamaChat(
  messages: OllamaMessage[],
  options?: OllamaChatOptions,
): Promise<string> {
  const model = options?.model ?? process.env.OLLAMA_MODEL ?? "gpt-oss:20b";
  const url = process.env.OLLAMA_URL ?? "http://localhost:11434";
  const timeoutMs = options?.timeoutMs ?? 120_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature: options?.temperature ?? 0.7,
          num_predict: options?.maxTokens ?? 1024,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Ollama error ${response.status}: ${body.slice(0, 200)}`,
      );
    }

    const data = (await response.json()) as {
      message?: { role: string; content: string };
    };
    return data.message?.content ?? "";
  } finally {
    clearTimeout(timer);
  }
}
