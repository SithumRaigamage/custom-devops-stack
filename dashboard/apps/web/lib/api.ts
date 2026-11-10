// Every request goes to the same origin: next.config.mjs rewrites /api/* to the
// Fastify API on 127.0.0.1:4000, so the session cookie is first-party and the
// browser sends it automatically. This is the only fetch helper in the app.

export const API_BASE = "/api";

// Service types
export type ServiceStatus =
  | "healthy"
  | "unhealthy"
  | "stopped"
  | "starting"
  | "stopping";
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

// Activity types
export type ActivityKind =
  | "start"
  | "stop"
  | "restart"
  | "healthy"
  | "unhealthy"
  | "status"
  | "build"
  | "warn"
  | "fail";

export interface ActivityEntry {
  id: number;
  ts: number;
  kind: string;
  message: string;
  actor: string;
  serviceId: number | null;
}

// Log types
export type LogLevel = "INFO" | "WARN" | "ERROR";

export interface LogLine {
  /** RFC3339 timestamp from Docker, or "" when the line had none. */
  ts: string;
  level: LogLevel;
  msg: string;
}

// Auth status
export interface AuthStatus {
  setupRequired: boolean;
  authenticated: boolean;
  username: string | null;
}

// --- API helpers ---

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

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (typeof body?.error === "string" && body.error) return body.error;
  } catch {
    // body was not JSON
  }
  return `API responded ${res.status}`;
}

export async function requestJSON<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()) as T;
}

// --- Services ---

export async function fetchServices(signal?: AbortSignal): Promise<Service[]> {
  return requestJSON<Service[]>("/services", { signal });
}

export async function runServiceAction(id: string, action: ServiceAction): Promise<void> {
  await apiFetch(`/services/${encodeURIComponent(id)}/${action}`, { method: "POST" });
}

export async function fetchServiceLogs(
  id: string,
  tail = 200,
  signal?: AbortSignal,
): Promise<LogLine[]> {
  const body = await requestJSON<{ lines?: LogLine[] }>(
    `/services/${encodeURIComponent(id)}/logs?tail=${tail}`,
    { signal },
  );
  return Array.isArray(body.lines) ? body.lines : [];
}

export function serviceLogStreamUrl(id: string): string {
  return `${API_BASE}/services/${encodeURIComponent(id)}/logs/stream`;
}

// --- Jenkins ---

export type JenkinsBuildStatus = "success" | "failed" | "unstable" | "aborted" | "running";

export interface JenkinsBuild {
  num: number;
  job: string;
  branch: string;
  status: JenkinsBuildStatus;
  durationMs: number;
  startedAt: number;
}

export interface JenkinsBuilds {
  configured: boolean;
  builds: JenkinsBuild[];
}

export interface JenkinsSummary {
  configured: boolean;
  successRate: number;
  averageDurationMs: number;
  running: number;
  failedToday: number;
}

export async function fetchJenkinsBuilds(signal?: AbortSignal): Promise<JenkinsBuilds> {
  const body = await requestJSON<{ configured?: boolean; builds?: JenkinsBuild[] }>(
    "/jenkins/builds",
    { signal },
  );
  return { configured: body.configured !== false, builds: body.builds ?? [] };
}

export async function fetchJenkinsSummary(signal?: AbortSignal): Promise<JenkinsSummary> {
  const body = await requestJSON<Partial<JenkinsSummary> & { configured?: boolean }>(
    "/jenkins/summary",
    { signal },
  );
  return {
    configured: body.configured !== false,
    successRate: body.successRate ?? 0,
    averageDurationMs: body.averageDurationMs ?? 0,
    running: body.running ?? 0,
    failedToday: body.failedToday ?? 0,
  };
}

export async function triggerJenkinsBuild(job: string): Promise<void> {
  await requestJSON(`/jenkins/jobs/${encodeURIComponent(job)}/build`, { method: "POST" });
}

export async function fetchJenkinsConsole(
  job: string,
  num: number,
  tail = 200,
  signal?: AbortSignal,
): Promise<{ configured: boolean; lines: string[] }> {
  const body = await requestJSON<{ configured?: boolean; lines?: string[] }>(
    `/jenkins/jobs/${encodeURIComponent(job)}/${num}/console?tail=${tail}`,
    { signal },
  );
  return { configured: body.configured !== false, lines: body.lines ?? [] };
}

// --- SonarQube ---

export interface SonarProject {
  key: string;
  name: string;
  lastAnalysisDate: string | null;
}

export interface SonarProjects {
  configured: boolean;
  projects: SonarProject[];
}

export interface SonarGate {
  status: string;
  conditions: {
    metricKey?: string;
    comparator?: string;
    errorThreshold?: string;
    actualValue?: string;
    status?: string;
  }[];
}

export interface SonarMeasures {
  bugs: number | null;
  vulnerabilities: number | null;
  securityHotspots: number | null;
  codeSmells: number | null;
  coverage: number | null;
  duplicatedLinesDensity: number | null;
  reliabilityRating: string | null;
  securityRating: string | null;
  sqaleRating: string | null;
  ncloc: number | null;
}

const EMPTY_SONAR_MEASURES: SonarMeasures = {
  bugs: null,
  vulnerabilities: null,
  securityHotspots: null,
  codeSmells: null,
  coverage: null,
  duplicatedLinesDensity: null,
  reliabilityRating: null,
  securityRating: null,
  sqaleRating: null,
  ncloc: null,
};

export async function fetchSonarProjects(signal?: AbortSignal): Promise<SonarProjects> {
  const body = await requestJSON<{ configured?: boolean; projects?: SonarProject[] }>(
    "/sonar/projects",
    { signal },
  );
  return { configured: body.configured !== false, projects: body.projects ?? [] };
}

export async function fetchSonarProject(
  key: string,
  signal?: AbortSignal,
): Promise<SonarProjectDetail> {
  const body = await requestJSON<Partial<SonarProjectDetail> & { configured?: boolean }>(
    `/sonar/projects/${encodeURIComponent(key)}`,
    { signal },
  );

  return {
    configured: body.configured !== false,
    key,
    name: body.name ?? key,
    lastAnalysisDate: body.lastAnalysisDate ?? null,
    gate: body.gate ?? { status: "NONE", conditions: [] },
    measures: { ...EMPTY_SONAR_MEASURES, ...(body.measures ?? {}) },
  };
}

export interface SonarProjectDetail {
  configured: boolean;
  key: string;
  name: string;
  lastAnalysisDate: string | null;
  gate: SonarGate;
  measures: SonarMeasures;
}

// --- Ollama ----

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

export async function fetchOllamaStatus(signal?: AbortSignal): Promise<OllamaStatus> {
  return requestJSON<OllamaStatus>("/ollama/status", { signal });
}

export async function fetchOllamaModels(signal?: AbortSignal): Promise<OllamaModel[]> {
  return requestJSON<OllamaModel[]>("/ollama/models", { signal });
}

export async function fetchOllamaRunning(signal?: AbortSignal): Promise<OllamaModel[]> {
  return requestJSON<OllamaModel[]>("/ollama/running", { signal });
}

// Load a model: POST /api/generate with empty prompt and keep_alive "30m"
export async function ollamaLoadModel(name: string): Promise<void> {
  await requestJSON("/ollama/models/" + encodeURIComponent(name) + "/load", { method: "POST" });
}

// Unload a model: POST with keep_alive 0
export async function ollamaUnloadModel(name: string): Promise<void> {
  await requestJSON("/ollama/models/" + encodeURIComponent(name) + "/unload", { method: "POST" });
}

// --- Activity & events ---

export const EVENTS_URL = `${API_BASE}/events`;

export async function fetchActivity(
  limit = 50,
  signal?: AbortSignal,
): Promise<ActivityEntry[]> {
  const body = await requestJSON<{ activity?: ActivityEntry[] }>(
    `/activity?limit=${limit}`,
    { signal },
  );
  return Array.isArray(body.activity) ? body.activity : [];
}

// --- Auth ---

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

// --- Metrics ---

export type MetricsRange = "1h" | "6h" | "24h";

export interface MetricPoint {
  ts: number;
  cpuPct: number;
  memPct: number;
  memBytes: number;
}

export interface ServiceMetricSeries {
  id: string;
  name: string;
  points: MetricPoint[];
}

export interface MetricsResponse {
  range: MetricsRange;
  from: number;
  to: number;
  points: MetricPoint[];
  services: ServiceMetricSeries[];
  latest: MetricPoint | null;
}

export async function fetchMetricsRange(
  range: MetricsRange,
  signal?: AbortSignal,
): Promise<MetricsResponse> {
  return requestJSON<MetricsResponse>(`/metrics?range=${range}`, { signal });
}
