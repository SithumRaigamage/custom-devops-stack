const REQUEST_TIMEOUT_MS = 10_000;

export interface OllamaModel {
  name: string;
  size: number;
  parameter_size?: string;
  quantization_level?: string;
  modified_at?: string;
}

export interface OllamaStatus {
  reachable: boolean;
  version: string | null;
}

export interface OllamaPsModel {
  name: string;
  size: number;
  digest?: string;
}

export interface OllamaChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Check if Ollama is reachable and get its version. */
export async function ollamaStatus(
  url: string = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434",
): Promise<OllamaStatus> {
  const base = url.replace(/\/+$/, "");
  const versionUrl = `${base}/api/version`;

  try {
    const res = await fetch(versionUrl, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      return { reachable: false, version: null };
    }
    const data = (await res.json()) as { version: string };
    return { reachable: true, version: data.version ?? null };
  } catch {
    return { reachable: false, version: null };
  }
}

/** Get the list of installed models from /api/tags. */
export async function ollamaModels(
  url: string = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434",
): Promise<OllamaModel[]> {
  const base = url.replace(/\/+$/, "");
  const tagsUrl = `${base}/api/tags`;

  try {
    const res = await fetch(tagsUrl, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      return [];
    }
    const data = (await res.json()) as { models: { name: string; size?: number; modified_at?: string }[] };
    return ((data.models ?? []) as OllamaModel[]).map((m) => ({
      name: m.name,
      size: m.size ?? 0,
      parameter_size: undefined,
      quantization_level: undefined,
      modified_at: m.modified_at ?? "",
    }));
  } catch {
    return [] as OllamaModel[];
  }
}

/** Get the list of running containers from /api/ps. */
export async function ollamaRunning(
  url: string = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434",
): Promise<OllamaPsModel[]> {
  const base = url.replace(/\/+$/, "");
  const psUrl = `${base}/api/ps`;

  try {
    const res = await fetch(psUrl, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      return [];
    }
    const data = (await res.json()) as { models: OllamaPsModel[] };
    return data.models ?? [];
  } catch {
    return [];
  }
}

async function ollamaPost(
  path: string,
  payload: Record<string, unknown>,
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const base = url.replace(/\/+$/, "");
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    throw new Error(`Ollama responded ${res.status}`);
  }
  return res;
}

/** Load a model: POST /api/generate with empty prompt and keep_alive "30m". */
export async function ollamaLoadModel(
  name: string,
  url: string = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434",
): Promise<void> {
  await ollamaPost(
    "/api/generate",
    { model: name, prompt: "", stream: false, keep_alive: "30m" },
    url,
    REQUEST_TIMEOUT_MS * 5,
  );
}

/** Unload a model from memory with keep_alive 0 (never delete its files). */
export async function ollamaUnloadModel(
  name: string,
  url: string = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434",
): Promise<void> {
  await ollamaPost(
    "/api/generate",
    { model: name, prompt: "", stream: false, keep_alive: 0 },
    url,
    REQUEST_TIMEOUT_MS * 5,
  );
}

/** Send a chat request and return the assistant's reply. */
export async function ollamaChat(
  model: string,
  messages: OllamaChatMessage[],
  url: string = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434",
): Promise<string> {
  const res = await ollamaPost(
    "/api/chat",
    { model, messages, stream: false },
    url,
    REQUEST_TIMEOUT_MS * 12,
  );
  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content?.trim() ?? "";
}