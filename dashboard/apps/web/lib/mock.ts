/**
 * Placeholder data for the Overview page until the API exposes these values.
 * Chart, activity, last build and quality gate are static; service metrics are keyed by id.
 */

export type ActivityKind = "start" | "stop" | "build" | "warn" | "fail";

export interface ActivityItem {
  kind: ActivityKind;
  text: string;
  time: string;
}

/** CPU and memory percentages, 13 points over the last hour. */
export const CPU_SERIES = [22, 25, 31, 28, 35, 41, 38, 44, 52, 47, 43, 39, 36];
export const MEMORY_SERIES = [48, 49, 51, 52, 55, 58, 57, 60, 62, 61, 60, 59, 58];

export const ACTIVITY: ActivityItem[] = [
  { kind: "fail", text: "Build #142 dashboard-api failed in tests", time: "12 min ago" },
  { kind: "warn", text: "SonarQube health check slow (4.8 s)", time: "26 min ago" },
  { kind: "stop", text: "Open WebUI stopped", time: "1 h ago" },
  { kind: "build", text: "Build #141 dashboard-web passed", time: "1 h ago" },
  { kind: "start", text: "Jenkins started", time: "3 d ago" },
];

export interface BuildSnapshot {
  status: "success" | "failed" | "unstable";
  number: number;
  job: string;
  when: string;
}

export const LAST_BUILD: BuildSnapshot = {
  status: "failed",
  number: 142,
  job: "dashboard-api",
  when: "12 min ago",
};

export const QUALITY_GATE = {
  gate: "Passed" as const,
  project: "dashboard-api",
  coverage: 71.4,
  bugs: 3,
};

export interface ServiceMetrics {
  description: string;
  uptime: string;
  cpu: number;
  memory: number;
  memoryLabel: string;
  note: string;
}

const DEFAULT_METRICS: ServiceMetrics = {
  description: "Docker Compose stack",
  uptime: "—",
  cpu: 0,
  memory: 0,
  memoryLabel: "—",
  note: "",
};

export const SERVICE_METRICS: Record<string, ServiceMetrics> = {
  jenkins: {
    description: "CI/CD automation server",
    uptime: "3d 4h",
    cpu: 18,
    memory: 42,
    memoryLabel: "1.3 GB",
    note: "",
  },
  sonarqube: {
    description: "Code quality and security analysis",
    uptime: "6h 12m",
    cpu: 61,
    memory: 74,
    memoryLabel: "2.4 GB",
    note: "Health check slow (4.8 s). Elasticsearch disk watermark at 90%.",
  },
  "open-webui": {
    description: "Chat UI for your local Ollama models",
    uptime: "—",
    cpu: 0,
    memory: 0,
    memoryLabel: "0 MB",
    note: "",
  },
};

export function metricsFor(id: string): ServiceMetrics {
  return SERVICE_METRICS[id] ?? DEFAULT_METRICS;
}

/** Container images, until the API reports them from the Compose files. */
export const SERVICE_IMAGES: Record<string, string> = {
  jenkins: "custom-jenkins:lts-jdk21",
  sonarqube: "sonarqube:community",
  "open-webui": "ghcr.io/open-webui/open-webui:main",
};

export function imageFor(id: string): string {
  return SERVICE_IMAGES[id] ?? "—";
}

export type BuildStatus = "success" | "failed" | "unstable" | "running" | "aborted";

export interface Build {
  num: number;
  job: string;
  branch: string;
  status: BuildStatus;
  duration: string;
  when: string;
}

/** Copy of the preview's recent-builds data, newest first. */
export const BUILDS: Build[] = [
  { num: 142, job: "dashboard-api", branch: "main", status: "failed", duration: "3m 12s", when: "12 min ago" },
  { num: 141, job: "dashboard-web", branch: "main", status: "success", duration: "4m 47s", when: "1 h ago" },
  { num: 140, job: "synode-api", branch: "develop", status: "success", duration: "6m 03s", when: "3 h ago" },
  { num: 139, job: "jobtrigger-flutter", branch: "feature/ci", status: "unstable", duration: "8m 21s", when: "5 h ago" },
  { num: 138, job: "dashboard-api", branch: "main", status: "success", duration: "2m 58s", when: "Yesterday" },
  { num: 137, job: "coverpress", branch: "main", status: "aborted", duration: "0m 41s", when: "Yesterday" },
];

export const AVERAGE_BUILD_DURATION = "4m 18s";

export type SonarGrade = "A" | "B" | "C" | "D" | "E";

export interface SonarProject {
  name: string;
  gate: "Passed" | "Failed";
  bugs: number;
  vulns: number;
  hotspots: number;
  smells: number;
  coverage: number;
  dup: number;
  rel: SonarGrade;
  sec: SonarGrade;
  maint: SonarGrade;
  loc: string;
  analysed: string;
}

/** Copy of the preview's sonarProjects data. */
export const SONAR_PROJECTS: SonarProject[] = [
  {
    name: "dashboard-api",
    gate: "Passed",
    bugs: 3,
    vulns: 0,
    hotspots: 2,
    smells: 47,
    coverage: 71.4,
    dup: 2.1,
    rel: "B",
    sec: "A",
    maint: "A",
    loc: "4.2k",
    analysed: "14 min ago",
  },
  {
    name: "synode-web",
    gate: "Failed",
    bugs: 12,
    vulns: 2,
    hotspots: 9,
    smells: 138,
    coverage: 48.2,
    dup: 6.8,
    rel: "C",
    sec: "D",
    maint: "B",
    loc: "18.7k",
    analysed: "2 h ago",
  },
  {
    name: "jobtrigger-flutter",
    gate: "Passed",
    bugs: 1,
    vulns: 0,
    hotspots: 0,
    smells: 22,
    coverage: 82.0,
    dup: 0.9,
    rel: "A",
    sec: "A",
    maint: "A",
    loc: "9.3k",
    analysed: "5 h ago",
  },
];
