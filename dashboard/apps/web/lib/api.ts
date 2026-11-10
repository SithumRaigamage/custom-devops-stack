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
  icon?: string;
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
  await requestJSON(`/services/${encodeURIComponent(id)}/${action}`, { method: "POST" });
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
  size: number;
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

// --- Uptime ---

export type UptimeStatus =
  | "healthy"
  | "unhealthy"
  | "stopped"
  | "starting"
  | "stopping"
  | "restarting";

export interface UptimeHour {
  start: number;
  status: UptimeStatus | null;
}

export interface ServiceUptime {
  id: string;
  name: string;
  uptime24h: number | null;
  uptime7d: number | null;
  samples24h: number;
  samples7d: number;
  hours: UptimeHour[];
}

export interface UptimeResponse {
  from: number;
  to: number;
  services: ServiceUptime[];
}

export async function fetchUptime(signal?: AbortSignal): Promise<UptimeResponse> {
  return requestJSON<UptimeResponse>("/uptime", { signal });
}

// --- Settings ---

export interface AlertRuleToggles {
  serviceStopped: boolean;
  serviceUnhealthy: boolean;
  jenkinsFailed: boolean;
  sonarGateFailed: boolean;
  ollamaUnreachable: boolean;
}

export interface NotificationPreferences {
  desktop: boolean;
  confirmStopAll: boolean;
  autoRefresh: boolean;
  rules: AlertRuleToggles;
  /** Write-only: the server returns an empty string and a configured flag. */
  discordWebhookUrl: string;
  /** Write-only: the server returns an empty string and a configured flag. */
  telegramBotToken: string;
  telegramChatId: string;
}

export interface NotificationChannels {
  discord: boolean;
  telegram: boolean;
}

export interface AppSettings {
  stackRoot: string;
  healthCheckIntervalSeconds: number;
  theme: string;
  mode: "light" | "dark";
  notifications: NotificationPreferences;
  channels: NotificationChannels;
}

export interface SettingsPatch {
  stackRoot?: string;
  healthCheckIntervalSeconds?: number;
  theme?: string;
  mode?: "light" | "dark";
  notifications?: Partial<Omit<NotificationPreferences, "rules">> & {
    rules?: Partial<AlertRuleToggles>;
  };
}

export async function fetchSettings(signal?: AbortSignal): Promise<AppSettings> {
  return requestJSON<AppSettings>("/settings", { signal });
}

export async function saveSettings(patch: SettingsPatch): Promise<AppSettings> {
  return requestJSON<AppSettings>("/settings", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

// --- Alerts ---

export type AlertSeverity = "info" | "warn" | "bad";

export interface Alert {
  id: number;
  ts: number;
  rule: string;
  severity: AlertSeverity;
  message: string;
  read: boolean;
  resolvedAt: number | null;
  serviceKey: string | null;
  link: string | null;
  incidentKey: string;
}

export interface AlertsResponse {
  alerts: Alert[];
  unread: number;
}

export type ChannelResult = "sent" | "not_configured" | "failed";

export async function fetchAlerts(signal?: AbortSignal): Promise<AlertsResponse> {
  return requestJSON<AlertsResponse>("/alerts", { signal });
}

export async function markAlertRead(id: number): Promise<void> {
  await requestJSON(`/alerts/${id}/read`, { method: "POST" });
}

export async function markAllAlertsRead(): Promise<void> {
  await requestJSON("/alerts/read", { method: "POST" });
}

export async function sendTestNotification(): Promise<{
  discord: ChannelResult;
  telegram: ChannelResult;
}> {
  return requestJSON("/notifications/test", { method: "POST" });
}

// --- Incidents ---

export interface Incident {
  id: number;
  start: number;
  end: number;
  durationMs: number;
  cause: string;
  severity: AlertSeverity;
  rule: string;
  serviceKey: string | null;
  link: string | null;
}

export interface IncidentsResponse {
  incidents: Incident[];
}

export async function fetchIncidents(signal?: AbortSignal): Promise<IncidentsResponse> {
  return requestJSON<IncidentsResponse>("/incidents?limit=50", { signal });
}

// --- Service registry ---

export interface RegistryService {
  id: string;
  name: string;
  desc?: string;
  image?: string;
  folder: string;
  relativeFolder: string;
  composeFile: string;
  url: string;
  health: string;
  port?: number;
  icon?: string;
  startCommand?: string;
  stopCommand?: string;
}

export interface RegistryFolder {
  name: string;
  folder: string;
  composeFile: string | null;
}

export interface ServiceInput {
  id?: string;
  name: string;
  desc?: string;
  folder: string;
  composeFile?: string;
  port: number;
  url: string;
  healthPath: string;
  icon?: string;
  startCommand?: string;
  stopCommand?: string;
}

export async function fetchRegistryServices(
  signal?: AbortSignal,
): Promise<RegistryService[]> {
  return requestJSON<RegistryService[]>("/registry/services", { signal });
}

export async function fetchRegistryFolders(
  signal?: AbortSignal,
): Promise<RegistryFolder[]> {
  return requestJSON<RegistryFolder[]>("/registry/folders", { signal });
}

export async function createRegistryService(
  input: ServiceInput,
): Promise<RegistryService> {
  return requestJSON<RegistryService>("/registry/services", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateRegistryService(
  id: string,
  input: ServiceInput,
): Promise<RegistryService> {
  return requestJSON<RegistryService>(
    `/registry/services/${encodeURIComponent(id)}`,
    { method: "PUT", body: JSON.stringify(input) },
  );
}

export async function deleteRegistryService(id: string): Promise<void> {
  await requestJSON(`/registry/services/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// --- Docker housekeeping ---

export type DiskCategoryKey = "images" | "containers" | "volumes" | "buildCache";

export interface DiskCategory {
  key: DiskCategoryKey;
  label: string;
  totalCount: number;
  activeCount: number;
  sizeBytes: number;
  reclaimableBytes: number;
}

export interface DiskUsage {
  categories: DiskCategory[];
  sizeBytes: number;
  reclaimableBytes: number;
}

export interface BackupFile {
  name: string;
  size: number;
  date: number;
  image: string | null;
  imagePresent: boolean;
}

export interface ServiceBackups {
  serviceId: string;
  serviceName: string;
  folder: string;
  backups: BackupFile[];
}

export interface DanglingImage {
  id: string;
  repository: string;
  tag: string;
  sizeBytes: number;
  createdSince: string;
}

export interface PrunePreview {
  images: DanglingImage[];
  buildCacheBytes: number;
  totalBytes: number;
}

export interface PruneResult {
  imagesRemoved: number;
  imagesSkipped: string[];
  buildCacheBytes: number;
  output: string;
}

export async function fetchDockerDisk(signal?: AbortSignal): Promise<DiskUsage> {
  return requestJSON<DiskUsage>("/docker/disk", { signal });
}

export async function fetchDockerBackups(
  signal?: AbortSignal,
): Promise<ServiceBackups[]> {
  return requestJSON<ServiceBackups[]>("/docker/backups", { signal });
}

export async function createDockerBackup(serviceId: string): Promise<BackupFile> {
  return requestJSON<BackupFile>(
    `/docker/backups/${encodeURIComponent(serviceId)}`,
    { method: "POST" },
  );
}

export async function restoreDockerBackup(
  serviceId: string,
  name: string,
): Promise<void> {
  await requestJSON(
    `/docker/backups/${encodeURIComponent(serviceId)}/restore`,
    { method: "POST", body: JSON.stringify({ name }) },
  );
}

export async function fetchPrunePreview(signal?: AbortSignal): Promise<PrunePreview> {
  return requestJSON<PrunePreview>("/docker/prune", { signal });
}

export async function runDockerPrune(): Promise<PruneResult> {
  return requestJSON<PruneResult>("/docker/prune", { method: "POST" });
}
