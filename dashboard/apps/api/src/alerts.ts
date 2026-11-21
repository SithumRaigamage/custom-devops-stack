import { pool } from "./db.js";
import { broadcast } from "./sse.js";
import { getSettings, type AppSettings } from "./settings.js";
import type { ServiceDetail, Status } from "./status.js";
import { isJenkinsConfigured, listJenkinsBuilds, type JenkinsBuild } from "./jenkins.js";
import { isSonarConfigured, listSonarProjects, sonarProject } from "./sonar.js";
import { ollamaStatus } from "./ollama.js";
import { getIntegrationConfig } from "./integrations.js";

async function integrationLink(kind: "jenkins" | "sonarqube" | "ollama"): Promise<string> {
  const config = await getIntegrationConfig(kind);
  return config ? `/services/${config.serviceId}` : "/services";
}

const UNHEALTHY_AFTER_MS = 60_000;
const EXTERNAL_INTERVAL_MS = 20_000;
const MAX_SONAR_PROJECTS = 10;

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

interface AlertRow {
  id: number;
  ts: string | number;
  rule: string;
  severity: string;
  message: string;
  read: number;
  resolved_at: string | number | null;
  service_key: string | null;
  link: string | null;
  incident_key: string | null;
}

interface ActiveAlert {
  incidentKey: string;
  serviceKey: string | null;
}

const ALERT_COLUMNS =
  "id, ts, rule, severity, message, read, resolved_at, service_key, link, incident_key";

function toAlert(row: AlertRow): Alert {
  return {
    id: row.id,
    ts: Number(row.ts),
    rule: row.rule,
    severity: row.severity as AlertSeverity,
    message: row.message,
    read: row.read === 1,
    resolvedAt: row.resolved_at === null ? null : Number(row.resolved_at),
    serviceKey: row.service_key,
    link: row.link,
    incidentKey: row.incident_key ?? "",
  };
}

// ---------------------------------------------------------------------------
// Reads and read-state
// ---------------------------------------------------------------------------

export async function listAlerts(limit = 50): Promise<AlertsResponse> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 200);

  const [{ rows }, unread] = await Promise.all([
    pool.query<AlertRow>(
      `SELECT ${ALERT_COLUMNS}
         FROM alerts
        ORDER BY (resolved_at IS NULL) DESC, ts DESC
        LIMIT $1`,
      [safeLimit],
    ),
    pool.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM alerts WHERE read = 0 AND resolved_at IS NULL",
    ),
  ]);

  return {
    alerts: rows.map(toAlert),
    unread: Number(unread.rows[0]?.count ?? 0),
  };
}

export async function markAlertRead(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    "UPDATE alerts SET read = 1 WHERE id = $1 AND read = 0",
    [id],
  );
  if (rowCount) broadcast("alerts.changed", { id });
  return (rowCount ?? 0) > 0;
}

export async function markAllAlertsRead(): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    "UPDATE alerts SET read = 1 WHERE read = 0 AND resolved_at IS NULL RETURNING id",
  );
  if (rows.length > 0) broadcast("alerts.changed", { count: rows.length });
  return rows.length;
}

// ---------------------------------------------------------------------------
// Incident lifecycle: one open row per incident, resolved on recovery
// ---------------------------------------------------------------------------

async function openAlert(input: {
  incidentKey: string;
  rule: string;
  severity: AlertSeverity;
  message: string;
  serviceKey?: string;
  link?: string;
}): Promise<void> {
  const { rows } = await pool.query<AlertRow>(
    `INSERT INTO alerts (ts, rule, severity, message, read, incident_key, service_key, link)
     VALUES ($1, $2, $3, $4, 0, $5, $6, $7)
     ON CONFLICT (incident_key) WHERE resolved_at IS NULL DO NOTHING
     RETURNING ${ALERT_COLUMNS}`,
    [
      Date.now(),
      input.rule,
      input.severity,
      input.message,
      input.incidentKey,
      input.serviceKey ?? null,
      input.link ?? null,
    ],
  );

  const row = rows[0];
  if (!row) return;

  const alert = toAlert(row);
  broadcast("alert.created", alert);
  void deliverToChannels(alert);
}

async function resolveAlert(incidentKey: string): Promise<void> {
  const { rows } = await pool.query<{ id: number; incident_key: string | null }>(
    `UPDATE alerts
        SET resolved_at = $2
      WHERE incident_key = $1 AND resolved_at IS NULL
      RETURNING id, incident_key`,
    [incidentKey, Date.now()],
  );

  for (const row of rows) {
    broadcast("alert.resolved", {
      id: row.id,
      incidentKey: row.incident_key ?? incidentKey,
    });
  }
}

async function resolveRule(rule: string): Promise<void> {
  const { rows } = await pool.query<{ id: number; incident_key: string | null }>(
    `UPDATE alerts
        SET resolved_at = $2
      WHERE rule = $1 AND resolved_at IS NULL
      RETURNING id, incident_key`,
    [rule, Date.now()],
  );

  for (const row of rows) {
    broadcast("alert.resolved", {
      id: row.id,
      incidentKey: row.incident_key ?? "",
    });
  }
}

async function activeAlerts(rule: string): Promise<ActiveAlert[]> {
  const { rows } = await pool.query<{ incident_key: string | null; service_key: string | null }>(
    `SELECT incident_key, service_key
       FROM alerts
      WHERE rule = $1 AND resolved_at IS NULL`,
    [rule],
  );

  return rows
    .filter((row) => row.incident_key !== null)
    .map((row) => ({ incidentKey: row.incident_key as string, serviceKey: row.service_key }));
}

// ---------------------------------------------------------------------------
// Delivery channels (secret values never leave the server)
// ---------------------------------------------------------------------------

const CHANNEL_TIMEOUT_MS = 5000;

interface DiscordEmbed {
  author?: { name: string };
  title: string;
  description?: string;
  color: number;
  url?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  timestamp: string;
  footer: { text: string };
}

const DISCORD_COLORS: Record<AlertSeverity, number> = {
  bad: 0xe5484d,
  warn: 0xf5a524,
  info: 0x3e9fe5,
};

interface RuleFlavor {
  icon: string;
  headline: string;
  quips: string[];
  nextStep: string;
}

/** Each rule gets its own personality so alerts are recognisable at a glance. */
const RULE_FLAVOR: Record<string, RuleFlavor> = {
  service_stopped: {
    icon: "🪦",
    headline: "Flatlined",
    quips: [
      "Went quiet without saying goodbye.",
      "Pulled the plug on itself.",
      "Not answering the door anymore.",
    ],
    nextStep: "Open the dashboard and hit Start, or check its logs for a crash.",
  },
  service_unhealthy: {
    icon: "🤒",
    headline: "Feeling unwell",
    quips: [
      "Running, but clearly not okay.",
      "Still up, but failing its health checks.",
      "Coughing and refusing to say why.",
    ],
    nextStep: "Peek at the logs, then restart if it doesn't recover.",
  },
  jenkins_failed: {
    icon: "🧯",
    headline: "Build on fire",
    quips: [
      "The pipeline tripped over its own shoelaces.",
      "Red build. Somebody's commit has opinions.",
      "Jenkins would like a word.",
    ],
    nextStep: "Check the console output of the failed run.",
  },
  sonar_gate_failed: {
    icon: "🚧",
    headline: "Quality gate says no",
    quips: [
      "Code smells detected. Gate stays shut.",
      "SonarQube is not impressed.",
      "Shipping blocked until the code cleans up.",
    ],
    nextStep: "Review the new issues in SonarQube.",
  },
  ollama_unreachable: {
    icon: "🦙",
    headline: "Llama went missing",
    quips: [
      "The local model stopped responding.",
      "Ollama wandered off. The assistant is on its own.",
      "No llama, no answers.",
    ],
    nextStep: "Make sure `ollama serve` is running.",
  },
};

const FALLBACK_FLAVOR: RuleFlavor = {
  icon: "📡",
  headline: "Heads up",
  quips: ["Something needs your attention."],
  nextStep: "Open the dashboard for details.",
};

function alertEmbed(alert: Alert): DiscordEmbed {
  const flavor = RULE_FLAVOR[alert.rule] ?? FALLBACK_FLAVOR;
  const quip = flavor.quips[alert.id % flavor.quips.length];
  const when = Math.floor(alert.ts / 1000);

  return {
    author: { name: "StackPilot · Mission Control" },
    title: `${flavor.icon}  ${flavor.headline}`,
    description: `**${alert.message}**\n*${quip}*`,
    color: DISCORD_COLORS[alert.severity] ?? DISCORD_COLORS.info,
    // Only absolute links are valid for Discord; in-app paths like /services are skipped.
    ...(alert.link && /^https?:\/\//i.test(alert.link) ? { url: alert.link } : {}),
    fields: [
      ...(alert.serviceKey ? [{ name: "Service", value: `\`${alert.serviceKey}\``, inline: true }] : []),
      { name: "Detected", value: `<t:${when}:R>`, inline: true },
      { name: "Try this", value: flavor.nextStep },
    ],
    timestamp: new Date(alert.ts).toISOString(),
    footer: { text: `Incident #${alert.id} · watching your stack 24/7` },
  };
}

async function postDiscord(webhookUrl: string, embed: DiscordEmbed): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "StackPilot", embeds: [embed] }),
    signal: AbortSignal.timeout(CHANNEL_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Discord responded ${res.status}`);
}

async function deliverToChannels(alert: Alert): Promise<void> {
  let settings: AppSettings;
  try {
    settings = await getSettings();
  } catch {
    return;
  }

  const { discordWebhookUrl } = settings.notifications;
  await Promise.allSettled([
    discordWebhookUrl
      ? postDiscord(discordWebhookUrl, alertEmbed(alert))
      : Promise.resolve(),
  ]);
}

/** Send a test message through every configured channel and report per channel. */
export async function sendTestNotification(): Promise<{
  discord: ChannelResult;
}> {
  const settings = await getSettings();
  const embed: DiscordEmbed = {
    author: { name: "StackPilot · Mission Control" },
    title: "📡  Signal received",
    description: "**Loud and clear.** Real alerts will land right here.",
    color: 0x30a46c,
    timestamp: new Date().toISOString(),
    footer: { text: "Test transmission · all systems nominal" },
  };

  const discord = await (settings.notifications.discordWebhookUrl
    ? postDiscord(settings.notifications.discordWebhookUrl, embed).then(
        () => "sent" as const,
        () => "failed" as const,
      )
    : Promise.resolve("not_configured" as const));

  return { discord };
}

// ---------------------------------------------------------------------------
// Alert engine
// ---------------------------------------------------------------------------

const unhealthySince = new Map<string, number>();
const previousStatus = new Map<string, Status>();
const intentionalStops = new Set<string>();

let externalRunning = false;
let externalLastRun = 0;

/** Called by the action routes so a user-requested stop is not an incident. */
export function setIntentionalStop(serviceId: string, intentional: boolean): void {
  if (intentional) intentionalStops.add(serviceId);
  else intentionalStops.delete(serviceId);
}

async function evaluateServices(
  details: ServiceDetail[],
  rules: AppSettings["notifications"]["rules"],
): Promise<void> {
  if (!rules.serviceStopped) await resolveRule("service_stopped");
  if (!rules.serviceUnhealthy) await resolveRule("service_unhealthy");

  for (const detail of details) {
    const before = previousStatus.get(detail.id);
    previousStatus.set(detail.id, detail.status);

    if (detail.status !== "stopped") intentionalStops.delete(detail.id);

    if (rules.serviceStopped && detail.status === "stopped") {
      if (intentionalStops.has(detail.id)) {
        await resolveAlert(`service-stopped:${detail.id}`);
      } else if (before !== undefined && before !== "stopped") {
        await openAlert({
          incidentKey: `service-stopped:${detail.id}`,
          rule: "service_stopped",
          severity: "bad",
          message: `${detail.name} stopped unexpectedly`,
          serviceKey: detail.id,
          link: "/services",
        });
      }
    } else {
      await resolveAlert(`service-stopped:${detail.id}`);
    }

    if (!rules.serviceUnhealthy) continue;

    if (detail.status === "unhealthy") {
      const since = unhealthySince.get(detail.id) ?? Date.now();
      if (!unhealthySince.has(detail.id)) unhealthySince.set(detail.id, since);

      if (Date.now() - since >= UNHEALTHY_AFTER_MS) {
        await openAlert({
          incidentKey: `service-unhealthy:${detail.id}`,
          rule: "service_unhealthy",
          severity: "bad",
          message: `${detail.name} has been unhealthy for over 60 seconds`,
          serviceKey: detail.id,
          link: "/services",
        });
      }
    } else {
      unhealthySince.delete(detail.id);
      await resolveAlert(`service-unhealthy:${detail.id}`);
    }
  }
}

async function evaluateJenkins(rules: AppSettings["notifications"]["rules"]): Promise<void> {
  if (!rules.jenkinsFailed || !(await isJenkinsConfigured())) {
    await resolveRule("jenkins_failed");
    return;
  }

  let builds: JenkinsBuild[];
  try {
    builds = await listJenkinsBuilds();
  } catch {
    return;
  }

  const latestByJob = new Map<string, JenkinsBuild>();
  for (const build of builds) {
    if (build.status === "running") continue;
    if (!latestByJob.has(build.job)) latestByJob.set(build.job, build);
  }

  const active = await activeAlerts("jenkins_failed");
  const seen = new Set<string>();

  for (const [job, build] of latestByJob) {
    const key = `jenkins:${job}:${build.num}`;

    if (build.status === "failed") {
      seen.add(key);
      await openAlert({
        incidentKey: key,
        rule: "jenkins_failed",
        severity: "warn",
        message: `Jenkins build failed: ${job} #${build.num}`,
        serviceKey: job,
        link: await integrationLink("jenkins"),
      });
    }

    for (const alert of active) {
      if (alert.serviceKey === job && alert.incidentKey !== key) {
        await resolveAlert(alert.incidentKey);
      }
    }
  }

  // Jobs whose builds dropped out of the window no longer have an incident.
  for (const alert of active) {
    if (!seen.has(alert.incidentKey) && !latestByJob.has(alert.serviceKey ?? "")) {
      await resolveAlert(alert.incidentKey);
    }
  }
}

async function evaluateSonar(rules: AppSettings["notifications"]["rules"]): Promise<void> {
  if (!rules.sonarGateFailed || !(await isSonarConfigured())) {
    await resolveRule("sonar_gate_failed");
    return;
  }

  let projects;
  try {
    projects = await listSonarProjects();
  } catch {
    return;
  }

  const active = await activeAlerts("sonar_gate_failed");
  const seen = new Set<string>();

  for (const project of projects.slice(0, MAX_SONAR_PROJECTS)) {
    let detail;
    try {
      detail = await sonarProject(project.key);
    } catch {
      continue;
    }

    const key = `sonar:${project.key}`;
    if (detail.gate.status === "ERROR") {
      seen.add(key);
      await openAlert({
        incidentKey: key,
        rule: "sonar_gate_failed",
        severity: "warn",
        message: `Quality gate failed for ${detail.name}`,
        serviceKey: project.key,
        link: await integrationLink("sonarqube"),
      });
    } else {
      await resolveAlert(key);
    }
  }

  for (const alert of active) {
    if (!seen.has(alert.incidentKey)) await resolveAlert(alert.incidentKey);
  }
}

async function evaluateOllama(rules: AppSettings["notifications"]["rules"]): Promise<void> {
  if (!rules.ollamaUnreachable) {
    await resolveRule("ollama_unreachable");
    return;
  }

  const status = await ollamaStatus();
  if (!status.configured) {
    await resolveAlert("ollama");
    return;
  }
  if (status.reachable) {
    await resolveAlert("ollama");
  } else {
    await openAlert({
      incidentKey: "ollama",
      rule: "ollama_unreachable",
      severity: "bad",
      message: "Ollama is unreachable",
      serviceKey: "ollama",
      link: await integrationLink("ollama"),
    });
  }
}

async function maybeEvaluateExternal(settings: AppSettings): Promise<void> {
  if (externalRunning || Date.now() - externalLastRun < EXTERNAL_INTERVAL_MS) return;

  externalRunning = true;
  try {
    const rules = settings.notifications.rules;
    await evaluateJenkins(rules);
    await evaluateSonar(rules);
    await evaluateOllama(rules);
  } finally {
    externalRunning = false;
    externalLastRun = Date.now();
  }
}

/** One pass of every rule; called on each service-status tick. */
export async function evaluateAlerts(details: ServiceDetail[]): Promise<void> {
  let settings: AppSettings;
  try {
    settings = await getSettings();
  } catch {
    return;
  }

  try {
    await evaluateServices(details, settings.notifications.rules);
  } catch {
    // DB hiccups are transient; the next tick re-evaluates the same incident.
  }

  try {
    await maybeEvaluateExternal(settings);
  } catch {
    // External probes fail independently; services keep being evaluated.
  }
}
