export const API_BASE = "http://127.0.0.1:4000";
export const SERVICES_URL = `${API_BASE}/api/services`;

export type ServiceStatus = "healthy" | "unhealthy" | "stopped";
export type ServiceAction = "start" | "stop" | "restart";

export interface Service {
  id: string;
  name: string;
  folder: string;
  composeFile: string;
  url: string;
  health: string;
  status: ServiceStatus;
}

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
  const res = await fetch(SERVICES_URL, { cache: "no-store", signal });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

export async function runServiceAction(id: string, action: ServiceAction): Promise<void> {
  const res = await fetch(`${SERVICES_URL}/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await errorMessage(res));
}

export async function fetchServiceLogs(
  id: string,
  tail = 100,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`${SERVICES_URL}/${encodeURIComponent(id)}/logs?tail=${tail}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  const body: { logs?: unknown } = await res.json();
  return typeof body.logs === "string" ? body.logs : "";
}
