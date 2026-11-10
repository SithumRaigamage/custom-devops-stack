const CACHE_TTL_MS = 10_000;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BUILDS = 20;

export type JenkinsBuildStatus =
  | "success"
  | "failed"
  | "unstable"
  | "aborted"
  | "running";

export interface JenkinsBuild {
  num: number;
  job: string;
  branch: string;
  status: JenkinsBuildStatus;
  durationMs: number;
  startedAt: number;
}

export interface JenkinsSummary {
  successRate: number;
  averageDurationMs: number;
  running: number;
  failedToday: number;
}

interface JenkinsParameter {
  name?: string;
  value?: unknown;
}

interface JenkinsBuildRaw {
  number?: number;
  result?: string | null;
  duration?: number;
  timestamp?: number;
  building?: boolean;
  actions?: { parameters?: JenkinsParameter[] }[];
}

interface JenkinsJobRaw {
  _class?: string;
  name?: string;
  url?: string;
  builds?: JenkinsBuildRaw[];
}

interface JenkinsJobsResponse {
  jobs?: JenkinsJobRaw[];
}

interface JenkinsCrumb {
  crumb?: string;
  crumbRequestField?: string;
}

export class JenkinsNotConfiguredError extends Error {
  constructor() {
    super("Jenkins is not configured");
  }
}

export class JenkinsHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function jenkinsConfig(): { url: string; auth: string } | null {
  const url = process.env.JENKINS_URL?.trim().replace(/\/+$/, "");
  const user = process.env.JENKINS_USER?.trim();
  const token = process.env.JENKINS_API_TOKEN?.trim();
  if (!url || !user || !token) return null;

  return {
    url,
    auth: `Basic ${Buffer.from(`${user}:${token}`).toString("base64")}`,
  };
}

export function isJenkinsConfigured(): boolean {
  return jenkinsConfig() !== null;
}

const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;

  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

function jobPath(job: string): string {
  return job
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/job/");
}

function requestHeaders(auth: string, extra: Record<string, string> = {}): HeadersInit {
  return {
    Authorization: auth,
    Accept: "application/json",
    ...extra,
  };
}

async function jenkinsFetch(path: string): Promise<Response> {
  const config = jenkinsConfig();
  if (!config) throw new JenkinsNotConfiguredError();

  let res: Response;
  try {
    res = await fetch(`${config.url}${path}`, {
      headers: requestHeaders(config.auth),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new JenkinsHttpError(502, `Cannot reach Jenkins: ${message}`);
  }

  if (!res.ok) {
    throw new JenkinsHttpError(res.status, `Jenkins responded ${res.status}`);
  }
  return res;
}

async function jenkinsJson<T>(path: string): Promise<T> {
  const res = await jenkinsFetch(path);
  return (await res.json()) as T;
}

async function crumbHeaders(): Promise<Record<string, string>> {
  const config = jenkinsConfig();
  if (!config) throw new JenkinsNotConfiguredError();

  try {
    const res = await fetch(`${config.url}/crumbIssuer/api/json`, {
      headers: requestHeaders(config.auth),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return {};

    const crumb = (await res.json()) as JenkinsCrumb;
    if (!crumb.crumb || !crumb.crumbRequestField) return {};
    return { [crumb.crumbRequestField]: crumb.crumb };
  } catch {
    // CSRF protection disabled or crumb unavailable: try the POST without it.
    return {};
  }
}

function statusOf(build: JenkinsBuildRaw): JenkinsBuildStatus {
  if (build.building) return "running";

  switch ((build.result ?? "").toUpperCase()) {
    case "SUCCESS":
      return "success";
    case "UNSTABLE":
      return "unstable";
    case "ABORTED":
    case "NOT_BUILT":
      return "aborted";
    default:
      return "failed";
  }
}

const BRANCH_PARAMS = ["BRANCH_NAME", "GIT_BRANCH", "CHANGE_BRANCH", "BRANCH", "branch"];

function branchOf(job: JenkinsJobRaw, build: JenkinsBuildRaw): string {
  for (const action of build.actions ?? []) {
    for (const parameter of action.parameters ?? []) {
      if (!parameter.name || !BRANCH_PARAMS.includes(parameter.name)) continue;
      if (parameter.value === undefined || parameter.value === null) continue;

      const value = String(parameter.value).trim();
      if (value) return value.replace(/^origin\//, "");
    }
  }

  if (/multibranch|WorkflowMultiBranchProject/i.test(job._class ?? "")) {
    return decodeURIComponent(job.name ?? "");
  }

  return "—";
}

function toBuild(job: JenkinsJobRaw, build: JenkinsBuildRaw): JenkinsBuild {
  return {
    num: build.number ?? 0,
    job: job.name ?? "unknown",
    branch: branchOf(job, build),
    status: statusOf(build),
    durationMs: build.duration ?? 0,
    startedAt: build.timestamp ?? 0,
  };
}

const TREE =
  "jobs[_class,name,url,builds[number,result,duration,timestamp,building,actions[parameters[name,value]]]{0,10}]";

async function allBuilds(): Promise<JenkinsBuild[]> {
  return cached("builds", async () => {
    const data = await jenkinsJson<JenkinsJobsResponse>(
      `/api/json?tree=${encodeURIComponent(TREE)}`,
    );

    const builds: JenkinsBuild[] = [];
    for (const job of data.jobs ?? []) {
      for (const build of job.builds ?? []) {
        builds.push(toBuild(job, build));
      }
    }

    return builds
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, MAX_BUILDS);
  });
}

function startOfToday(): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

export async function listJenkinsBuilds(): Promise<JenkinsBuild[]> {
  return allBuilds();
}

export async function jenkinsSummary(): Promise<JenkinsSummary> {
  return cached("summary", async () => {
    const builds = await allBuilds();
    const finished = builds.filter((build) => build.status !== "running");
    const succeeded = builds.filter((build) => build.status === "success").length;
    const durationTotal = finished.reduce((total, build) => total + build.durationMs, 0);
    const today = startOfToday();

    return {
      successRate:
        finished.length > 0 ? Math.round((succeeded / finished.length) * 100) : 0,
      averageDurationMs:
        finished.length > 0 ? Math.round(durationTotal / finished.length) : 0,
      running: builds.filter((build) => build.status === "running").length,
      failedToday: builds.filter(
        (build) => build.status === "failed" && build.startedAt >= today,
      ).length,
    };
  });
}

export async function triggerJenkinsBuild(job: string): Promise<void> {
  const config = jenkinsConfig();
  if (!config) throw new JenkinsNotConfiguredError();

  const headers = await crumbHeaders();
  let res: Response;

  try {
    res = await fetch(`${config.url}/job/${jobPath(job)}/build`, {
      method: "POST",
      headers: requestHeaders(config.auth, headers),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new JenkinsHttpError(502, `Cannot reach Jenkins: ${message}`);
  }

  if (!res.ok && res.status !== 201) {
    throw new JenkinsHttpError(res.status, `Jenkins responded ${res.status}`);
  }

  // The next read should reflect the queued build.
  cache.delete("builds");
  cache.delete("summary");
}

export async function jenkinsConsole(
  job: string,
  num: number,
  tail: number,
): Promise<string[]> {
  return cached(`console:${job}:${num}:${tail}`, async () => {
    const textRes = await jenkinsFetch(`/job/${jobPath(job)}/${num}/consoleText`);
    const text = await textRes.text();
    return text.split("\n").slice(-tail);
  });
}
