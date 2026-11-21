import { getIntegrationConfig, integrationFetch, IntegrationError } from "./integrations.js";

const REQUEST_TIMEOUT_MS = 10_000;

export interface OllamaModel {
  name: string;
  size: number;
  parameter_size?: string;
  quantization_level?: string;
  modified_at?: string;
}

export interface OllamaStatus {
  configured: boolean;
  reachable: boolean;
  version: string | null;
  /** The real reason when unreachable (connection refused, 401, timeout, …). */
  error?: string;
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

export class OllamaNotConfiguredError extends Error {
  constructor() {
    super("Ollama is not configured");
  }
}

async function ollamaConfig(serviceId?: string) {
  const config = await getIntegrationConfig("ollama", serviceId);
  if (!config) throw new OllamaNotConfiguredError();
  return config;
}

/** Check if Ollama is reachable and get its version. */
export async function ollamaStatus(serviceId?: string): Promise<OllamaStatus> {
  let config;
  try {
    config = await ollamaConfig(serviceId);
  } catch {
    return { configured: false, reachable: false, version: null, error: "Ollama is not configured" };
  }
  try {
    const res = await integrationFetch(config, "/api/version");
    const data = (await res.json()) as { version?: string };
    return { configured: true, reachable: true, version: data.version ?? null };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      version: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Get the list of installed models from /api/tags. Errors carry the real reason. */
export async function ollamaModels(serviceId?: string): Promise<OllamaModel[]> {
  const res = await integrationFetch(await ollamaConfig(serviceId), "/api/tags");
  const data = (await res.json()) as { models?: { name: string; size?: number; modified_at?: string }[] };
  return (data.models ?? []).map((m) => ({
    name: m.name,
    size: m.size ?? 0,
    parameter_size: undefined,
    quantization_level: undefined,
    modified_at: m.modified_at ?? "",
  }));
}

/** Get the list of running models from /api/ps. */
export async function ollamaRunning(serviceId?: string): Promise<OllamaPsModel[]> {
  const res = await integrationFetch(await ollamaConfig(serviceId), "/api/ps");
  const data = (await res.json()) as { models?: OllamaPsModel[] };
  return data.models ?? [];
}

async function ollamaPost(
  path: string,
  payload: Record<string, unknown>,
  serviceId: string | undefined,
  timeoutMs: number,
): Promise<Response> {
  return integrationFetch(await ollamaConfig(serviceId), path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs,
  });
}

/** Load a model: POST /api/generate with empty prompt and keep_alive "30m". */
export async function ollamaLoadModel(name: string, serviceId?: string): Promise<void> {
  await ollamaPost(
    "/api/generate",
    { model: name, prompt: "", stream: false, keep_alive: "30m" },
    serviceId,
    REQUEST_TIMEOUT_MS * 5,
  );
}

/** Unload a model from memory with keep_alive 0 (never delete its files). */
export async function ollamaUnloadModel(name: string, serviceId?: string): Promise<void> {
  await ollamaPost(
    "/api/generate",
    { model: name, prompt: "", stream: false, keep_alive: 0 },
    serviceId,
    REQUEST_TIMEOUT_MS * 5,
  );
}

/** Send a chat request and return the assistant's reply. */
export async function ollamaChat(
  model: string,
  messages: OllamaChatMessage[],
  serviceId?: string,
): Promise<string> {
  const res = await ollamaPost(
    "/api/chat",
    { model, messages, stream: false },
    serviceId,
    REQUEST_TIMEOUT_MS * 12,
  );
  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content?.trim() ?? "";
}

export { IntegrationError };
