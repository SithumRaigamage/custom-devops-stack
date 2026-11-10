import { getIntegrationConfig, integrationFetch, type IntegrationConfig } from "./integrations.js";

const CACHE_TTL_MS = 10_000;
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
  fullName?: string;
  url?: string;
  builds?: JenkinsBuildRaw[];
  /** Folders and multibranch projects nest their jobs here. */
  jobs?: JenkinsJobRaw[];
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

async function jenkinsConfig(serviceId?: string): Promise<IntegrationConfig | null> {
  const config = await getIntegrationConfig("jenkins", serviceId);
  return config?.username && config.secret ? config : null;
}

export async function isJenkinsConfigured(serviceId?: string): Promise<boolean> {
  return (await jenkinsConfig(serviceId)) !== null;
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

async function jenkinsFetch(path: string, serviceId?: string): Promise<Response> {
  const config = await jenkinsConfig(serviceId);
  if (!config) throw new JenkinsNotConfiguredError();
  return integrationFetch(config, path);
}

async function jenkinsJson<T>(path: string, serviceId?: string): Promise<T> {
  const res = await jenkinsFetch(path, serviceId);
  return (await res.json()) as T;
}

async function crumbHeaders(config: IntegrationConfig): Promise<Record<string, string>> {
  try {
    const res = await integrationFetch(config, "/crumbIssuer/api/json");
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

function branchOf(job: JenkinsJobRaw, build: JenkinsBuildRaw, parent?: JenkinsJobRaw): string {
  for (const action of build.actions ?? []) {
    for (const parameter of action.parameters ?? []) {
      if (!parameter.name || !BRANCH_PARAMS.includes(parameter.name)) continue;
      if (parameter.value === undefined || parameter.value === null) continue;

      const value = String(parameter.value).trim();
      if (value) return value.replace(/^origin\//, "");
    }
  }

  // A job inside a multibranch project is one branch of that project.
  if (/multibranch|WorkflowMultiBranchProject/i.test(parent?._class ?? job._class ?? "")) {
    return decodeURIComponent(job.name ?? "");
  }

  return "—";
}

/** Folders and multibranch projects contain jobs; the builds are on the leaves. */
function toBuild(job: JenkinsJobRaw, build: JenkinsBuildRaw, parent?: JenkinsJobRaw): JenkinsBuild {
  const isBranch = /multibranch|WorkflowMultiBranchProject/i.test(parent?._class ?? "");
  const display = isBranch ? parent?.fullName ?? parent?.name : job.fullName ?? job.name;
  return {
    num: build.number ?? 0,
    job: display ?? "unknown",
    branch: branchOf(job, build, parent),
    status: statusOf(build),
    durationMs: build.duration ?? 0,
    startedAt: build.timestamp ?? 0,
  };
}

function collectBuilds(job: JenkinsJobRaw, out: JenkinsBuild[], parent?: JenkinsJobRaw): void {
  for (const build of job.builds ?? []) out.push(toBuild(job, build, parent));
  for (const child of job.jobs ?? []) collectBuilds(child, out, job);
}

const JOB_FIELDS =
  "_class,name,fullName,url,builds[number,result,duration,timestamp,building,actions[parameters[name,value]]]{0,10}";
/** Jobs nested in folders up to 5 levels deep. */
const TREE = `jobs[${JOB_FIELDS},jobs[${JOB_FIELDS},jobs[${JOB_FIELDS},jobs[${JOB_FIELDS},jobs[${JOB_FIELDS}]]]]]`;

async function allBuilds(serviceId?: string): Promise<JenkinsBuild[]> {
  return cached(`builds:${serviceId ?? ""}`, async () => {
    const data = await jenkinsJson<JenkinsJobsResponse>(
      `/api/json?tree=${encodeURIComponent(TREE)}`,
      serviceId,
    );

    const builds: JenkinsBuild[] = [];
    for (const job of data.jobs ?? []) collectBuilds(job, builds);

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

export async function listJenkinsBuilds(serviceId?: string): Promise<JenkinsBuild[]> {
  return allBuilds(serviceId);
}

export async function jenkinsSummary(serviceId?: string): Promise<JenkinsSummary> {
  return cached(`summary:${serviceId ?? ""}`, async () => {
    const builds = await allBuilds(serviceId);
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

export async function triggerJenkinsBuild(job: string, serviceId?: string): Promise<void> {
  const config = await jenkinsConfig(serviceId);
  if (!config) throw new JenkinsNotConfiguredError();

  await integrationFetch(config, `/job/${jobPath(job)}/build`, {
    method: "POST",
    headers: await crumbHeaders(config),
  });

  // The next read should reflect the queued build.
  cache.delete(`builds:${serviceId ?? ""}`);
  cache.delete(`summary:${serviceId ?? ""}`);
}

export async function jenkinsConsole(
  job: string,
  num: number,
  tail: number,
  serviceId?: string,
): Promise<string[]> {
  return cached(`console:${serviceId ?? ""}:${job}:${num}:${tail}`, async () => {
    const textRes = await jenkinsFetch(`/job/${jobPath(job)}/${num}/consoleText`, serviceId);
    const text = await textRes.text();
    return text.split("\n").slice(-tail);
  });
}
