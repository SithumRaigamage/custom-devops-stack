export type Status = "healthy" | "unhealthy" | "stopped";
export type Action = "start" | "stop" | "restart";

export interface Service {
  id: string;
  name: string;
  url: string;
  status: Status;
}

export const API_URL = "http://localhost:4000/api/services";

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.error === "string" && body.error) return body.error;
  } catch {
    // body was not JSON
  }
  return `API responded ${res.status}`;
}

export async function fetchServices(signal?: AbortSignal): Promise<Service[]> {
  const res = await fetch(API_URL, { cache: "no-store", signal });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

export async function runAction(id: string, action: Action): Promise<void> {
  const res = await fetch(`${API_URL}/${encodeURIComponent(id)}/${action}`, { method: "POST" });
  if (!res.ok) throw new Error(await errorMessage(res));
}

export async function fetchLogs(id: string, tail: number, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${API_URL}/${encodeURIComponent(id)}/logs?tail=${tail}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()).logs as string;
}
