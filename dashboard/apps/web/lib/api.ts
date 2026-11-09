// Every request goes to the same origin: next.config.mjs rewrites /api/* to the
// Fastify API on 127.0.0.1:4000, so the session cookie is first-party and the
// browser sends it automatically. This is the only fetch helper in the app.

export const API_BASE = "/api";

export type ServiceStatus =
  | "healthy"
  | "unhealthy"
  | "stopped"
  | "starting"
  | "stopping"
  | "restarting";
export type ServiceAction = "start" | "stop" | "restart";

export interface Service {
  id: string;
  name: string;
  desc: string;
  port: string;
  url: string;
  folder: string;
  image: string;
  status: ServiceStatus;
  cpuPct: number;
  memBytes: number;
  memPct: number;
  uptime: string;
  healthNote: string;
}

export interface AuthStatus {
  setupRequired: boolean;
  authenticated: boolean;
  username: string | null;
}

interface ApiErrorBody {
  error?: unknown;
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    if (typeof body?.error === "string" && body.error) return body.error;
  } catch {
    // body was not JSON
  }
  return `API responded ${res.status}`;
}

/** The one fetch helper: always same-origin, always cookies, always X-StackPilot. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("X-StackPilot", "1");
  headers.set("Accept", "application/json");
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers,
    cache: "no-store",
  });
}

async function requestJSON<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()) as T;
}

export async function fetchServices(signal?: AbortSignal): Promise<Service[]> {
  return requestJSON<Service[]>("/services", { signal });
}

export async function runServiceAction(id: string, action: ServiceAction): Promise<void> {
  await apiFetch(`/services/${encodeURIComponent(id)}/${action}`, { method: "POST" });
}

export async function fetchServiceLogs(
  id: string,
  tail = 100,
  signal?: AbortSignal,
): Promise<string> {
  const body = await requestJSON<{ logs?: unknown }>(
    `/services/${encodeURIComponent(id)}/logs?tail=${tail}`,
    { signal },
  );
  return typeof body.logs === "string" ? body.logs : "";
}

// ---- Auth ----

export async function fetchAuthStatus(signal?: AbortSignal): Promise<AuthStatus> {
  return requestJSON<AuthStatus>("/auth/status", { signal });
}

export async function setupAdmin(username: string, password: string): Promise<void> {
  await requestJSON("/auth/setup", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function login(username: string, password: string): Promise<void> {
  await requestJSON("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function logout(): Promise<void> {
  await requestJSON("/auth/logout", { method: "POST" });
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await requestJSON("/auth/password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}
