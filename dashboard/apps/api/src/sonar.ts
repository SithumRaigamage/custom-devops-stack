const CACHE_TTL_MS = 30_000;
import { getIntegrationConfig, integrationFetch, type IntegrationConfig } from "./integrations.js";
const PAGE_SIZE = 100;

const METRIC_KEYS = [
  "bugs",
  "vulnerabilities",
  "security_hotspots",
  "code_smells",
  "coverage",
  "duplicated_lines_density",
  "reliability_rating",
  "security_rating",
  "sqale_rating",
  "ncloc",
].join(",");

export interface SonarProject {
  key: string;
  name: string;
  lastAnalysisDate: string | null;
}

export interface SonarCondition {
  metricKey?: string;
  comparator?: string;
  errorThreshold?: string;
  actualValue?: string;
  status?: string;
}

export interface SonarGate {
  status: string;
  conditions: SonarCondition[];
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

export interface SonarProjectDetail {
  key: string;
  name: string;
  lastAnalysisDate: string | null;
  gate: SonarGate;
  measures: SonarMeasures;
}

interface ProjectsResponse {
  components?: { key?: string; name?: string; lastAnalysisDate?: string }[];
}

interface ProjectStatusResponse {
  projectStatus?: { status?: string; conditions?: SonarCondition[] };
}

interface MeasuresResponse {
  component?: {
    key?: string;
    name?: string;
    measures?: { metric?: string; value?: string }[];
  };
}

interface AnalysesResponse {
  analyses?: { date?: string }[];
}

export class SonarNotConfiguredError extends Error {
  constructor() {
    super("SonarQube is not configured");
  }
}

export class SonarHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function sonarConfig(serviceId?: string): Promise<IntegrationConfig | null> {
  const config = await getIntegrationConfig("sonarqube", serviceId);
  return config?.secret ? config : null;
}

export async function isSonarConfigured(serviceId?: string): Promise<boolean> {
  return (await sonarConfig(serviceId)) !== null;
}

const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;

  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function sonarGet<T>(path: string, params: Record<string, string>, serviceId?: string): Promise<T> {
  const config = await sonarConfig(serviceId);
  if (!config) throw new SonarNotConfiguredError();

  const query = new URLSearchParams(params).toString();
  const res = await integrationFetch(config, query ? `${path}?${query}` : path);
  return (await res.json()) as T;
}

const RATINGS: Record<number, string> = {
  1: "A",
  2: "B",
  3: "C",
  4: "D",
  5: "E",
};

/** Sonar returns ratings as 1-5; the UI shows A-E. */
function grade(value: string | undefined): string | null {
  if (value === undefined) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return RATINGS[Math.round(numeric)] ?? null;
}

function numberOrNull(value: string | undefined): number | null {
  if (value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export async function listSonarProjects(serviceId?: string): Promise<SonarProject[]> {
  return cached(`projects:${serviceId ?? ""}`, async () => {
    const data = await sonarGet<ProjectsResponse>("/api/projects/search", {
      ps: String(PAGE_SIZE),
    }, serviceId);

    return (data.components ?? [])
      .filter((component): component is { key: string; name?: string; lastAnalysisDate?: string } =>
        Boolean(component.key),
      )
      .map((component) => ({
        key: component.key,
        name: component.name ?? component.key,
        lastAnalysisDate: component.lastAnalysisDate ?? null,
      }));
  });
}

export async function sonarProject(key: string, serviceId?: string): Promise<SonarProjectDetail> {
  return cached(`project:${serviceId ?? ""}:${key}`, async () => {
    const [status, measures, analyses] = await Promise.all([
      sonarGet<ProjectStatusResponse>("/api/qualitygates/project_status", {
        projectKey: key,
      }, serviceId),
      sonarGet<MeasuresResponse>("/api/measures/component", {
        component: key,
        metricKeys: METRIC_KEYS,
      }, serviceId),
      sonarGet<AnalysesResponse>("/api/project_analyses/search", {
        project: key,
        ps: "1",
      }, serviceId),
    ]);

    const values = new Map(
      (measures.component?.measures ?? []).map((measure) => [
        measure.metric ?? "",
        measure.value,
      ]),
    );

    return {
      key,
      name: measures.component?.name ?? key,
      lastAnalysisDate: analyses.analyses?.[0]?.date ?? null,
      gate: {
        status: status.projectStatus?.status ?? "NONE",
        conditions: status.projectStatus?.conditions ?? [],
      },
      measures: {
        bugs: numberOrNull(values.get("bugs")),
        vulnerabilities: numberOrNull(values.get("vulnerabilities")),
        securityHotspots: numberOrNull(values.get("security_hotspots")),
        codeSmells: numberOrNull(values.get("code_smells")),
        coverage: numberOrNull(values.get("coverage")),
        duplicatedLinesDensity: numberOrNull(values.get("duplicated_lines_density")),
        reliabilityRating: grade(values.get("reliability_rating")),
        securityRating: grade(values.get("security_rating")),
        sqaleRating: grade(values.get("sqale_rating")),
        ncloc: numberOrNull(values.get("ncloc")),
      },
    };
  });
}
