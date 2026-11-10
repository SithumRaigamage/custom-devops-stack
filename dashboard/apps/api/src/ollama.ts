const REQUEST_TIMEOUT_MS = 10_000;

export interface OllamaModel {
  name: string;
  size: string;
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
  size: string;
  digest?: string;
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
    const data = (await res.json()) as { models: { name: string; size?: string; modified_at?: string }[] };
    return ((data.models ?? []) as OllamaModel[]).map((m) => ({
      name: m.name,
      size: m.size ?? "",
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

/** Load a model: POST /api/generate with empty prompt and keep_alive "30m". */
export async function ollamaLoadModel(
  name: string,
  url: string = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434",
): Promise<void> {
  const base = url.replace(/\/+$/, "");
  // Model names contain colons, so URL-encode them
  const encodedName = encodeURIComponent(name);
  const generateUrl = `${base}/api/generate`;

  const body = JSON.stringify({
    prompt: "",
    keep_alive: "30m",
  });

  try {
    await fetch(generateUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS * 5),
    });
  } catch {
    // Silently fail - the UI will show the "not reachable" state
  }
}

/** Unload a model: POST to /api/delete with keep_alive 0. */
export async function ollamaUnloadModel(
  name: string,
  url: string = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434",
): Promise<void> {
  const base = url.replace(/\/+$/, "");
  // Model names contain colons, so URL-encode them
  const encodedName = encodeURIComponent(name);
  const deleteUrl = `${base}/api/delete`;

  const body = JSON.stringify({
    name: name,
    keep_alive: 0,
  });

  try {
    await fetch(deleteUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS * 5),
    });
  } catch {
    // Silently fail - the UI will show the "not reachable" state
  }
}