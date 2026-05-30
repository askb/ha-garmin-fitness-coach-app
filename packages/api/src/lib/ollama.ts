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
      throw new Error(`Ollama error ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      message?: { role: string; content: string };
    };
    return data.message?.content ?? "";
  } finally {
    clearTimeout(timer);
  }
}

export interface OllamaEmbedOptions {
  /** Embedding model tag. Default OLLAMA_EMBED_MODEL or "nomic-embed-text". */
  model?: string;
  /** Fetch timeout in milliseconds (default 30 000). */
  timeoutMs?: number;
}

/**
 * Embed a single piece of text via a local Ollama instance and return the
 * embedding vector, or `null` if embeddings are unavailable (no server, model
 * not pulled, request failed). Callers MUST treat `null` as "memory disabled"
 * and degrade gracefully — never throw the coach turn on an embedding miss.
 *
 * Tries the configured embed model first (default `nomic-embed-text`) and
 * falls back to the chat model (`OLLAMA_MODEL`, default `gpt-oss:20b`) so a box
 * that only has the large model still works without a separate pull.
 *
 * Environment variables:
 *   OLLAMA_URL         – base URL  (default http://localhost:11434)
 *   OLLAMA_EMBED_MODEL – embed model tag (default nomic-embed-text)
 *   OLLAMA_MODEL       – chat model tag, used as embed fallback
 */
export async function ollamaEmbed(
  text: string,
  options?: OllamaEmbedOptions,
): Promise<number[] | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const url = process.env.OLLAMA_URL ?? "http://localhost:11434";
  const primary =
    options?.model ?? process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text";
  const fallback = process.env.OLLAMA_MODEL ?? "gpt-oss:20b";
  const models = primary === fallback ? [primary] : [primary, fallback];
  const timeoutMs = options?.timeoutMs ?? 30_000;

  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${url}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ model, prompt: trimmed }),
      });
      if (!response.ok) continue;
      const data = (await response.json()) as { embedding?: number[] };
      if (Array.isArray(data.embedding) && data.embedding.length > 0) {
        return data.embedding;
      }
    } catch {
      // Try the next model, then give up gracefully.
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
