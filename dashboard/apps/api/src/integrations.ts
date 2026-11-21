import { pool } from "./db.js";
import { refreshServices, type IntegrationKind } from "./services.js";
import { decryptSecret, encryptSecret } from "./credentials.js";
import { normalizeBaseUrl, type IntegrationConfig } from "./integration-probe.js";

// Credential encryption and probing live in DB-free modules so unit tests can
// run without PostgreSQL. Re-exported here so existing importers keep working.
export { decryptSecret, encryptSecret, normalizeBaseUrl };
export {
  INTEGRATION_TIMEOUT_MS,
  IntegrationError,
  describeFetchError,
  integrationFetch,
  statusMessage,
  testConnection,
} from "./integration-probe.js";
export type { IntegrationConfig, ProbeOutcome, ProbeResult } from "./integration-probe.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface ConfigRow {
  compose_id: string;
  integration: IntegrationKind;
  integration_url: string | null;
  integration_user: string | null;
  integration_header: string | null;
  secret_enc: string | null;
}

function rowToConfig(row: ConfigRow): IntegrationConfig | null {
  if (!row.integration_url || row.integration === "none") return null;
  let secret: string | undefined;
  if (row.secret_enc) {
    try {
      secret = decryptSecret(row.secret_enc);
    } catch {
      // SESSION_SECRET changed: treat the credential as missing so the UI asks to Replace it.
      secret = undefined;
    }
  }
  return {
    serviceId: row.compose_id,
    kind: row.integration,
    baseUrl: normalizeBaseUrl(row.integration_url),
    ...(row.integration_user ? { username: row.integration_user } : {}),
    ...(secret ? { secret } : {}),
    ...(row.integration_header ? { headerName: row.integration_header } : {}),
  };
}

const CONFIG_SELECT = `SELECT s.compose_id, s.integration, s.integration_url, s.integration_user,
       s.integration_header, c.secret_enc
  FROM services s LEFT JOIN service_credentials c ON c.compose_id = s.compose_id`;

/** Config for one service, or the first service (by sort order) with the given integration kind. */
export async function getIntegrationConfig(
  kind: IntegrationKind,
  serviceId?: string,
): Promise<IntegrationConfig | null> {
  const { rows } = serviceId
    ? await pool.query<ConfigRow>(`${CONFIG_SELECT} WHERE s.compose_id = $1 AND s.integration = $2`, [serviceId, kind])
    : await pool.query<ConfigRow>(
        `${CONFIG_SELECT} WHERE s.integration = $1 ORDER BY s.sort_order, s.compose_id LIMIT 1`,
        [kind],
      );
  return rows[0] ? rowToConfig(rows[0]) : null;
}

export async function getStoredSecret(serviceId: string): Promise<string | undefined> {
  const { rows } = await pool.query<{ secret_enc: string }>(
    "SELECT secret_enc FROM service_credentials WHERE compose_id = $1",
    [serviceId],
  );
  if (!rows[0]) return undefined;
  try {
    return decryptSecret(rows[0].secret_enc);
  } catch {
    return undefined;
  }
}

export async function saveSecret(serviceId: string, secret: string): Promise<void> {
  await pool.query(
    `INSERT INTO service_credentials (compose_id, secret_enc, updated_at) VALUES ($1,$2,$3)
     ON CONFLICT (compose_id) DO UPDATE SET secret_enc = EXCLUDED.secret_enc, updated_at = EXCLUDED.updated_at`,
    [serviceId, encryptSecret(secret), Date.now()],
  );
}

export async function removeSecret(serviceId: string): Promise<void> {
  await pool.query("DELETE FROM service_credentials WHERE compose_id = $1", [serviceId]);
}

// ---------------------------------------------------------------------------
// One-time import of the old .env settings into the matching services
// ---------------------------------------------------------------------------

const ENV_SOURCES: Array<{
  kind: Exclude<IntegrationKind, "none" | "generic_http">;
  needle: string;
  url?: string;
  user?: string;
  secret?: string;
}> = [
  {
    kind: "jenkins",
    needle: "jenkins",
    url: process.env.JENKINS_URL,
    user: process.env.JENKINS_USER,
    secret: process.env.JENKINS_API_TOKEN,
  },
  { kind: "sonarqube", needle: "sonar", url: process.env.SONAR_URL, secret: process.env.SONAR_TOKEN },
  { kind: "ollama", needle: "ollama", url: process.env.OLLAMA_URL },
];

export async function importEnvIntegrations(): Promise<string[]> {
  const imported: string[] = [];
  for (const source of ENV_SOURCES) {
    const url = source.url?.trim();
    if (!url) continue;
    const flag = `integration_env_import:${source.kind}`;
    const done = await pool.query("SELECT 1 FROM settings WHERE key = $1", [flag]);
    if (done.rowCount) continue;

    const { rows } = await pool.query<{ compose_id: string }>(
      `SELECT compose_id FROM services
        WHERE integration = 'none' AND (lower(compose_id) LIKE $1 OR lower(name) LIKE $1)
        ORDER BY sort_order LIMIT 1`,
      [`%${source.needle}%`],
    );
    const match = rows[0];
    if (!match) continue; // no matching service yet; try again next start

    await pool.query(
      `UPDATE services SET integration=$1, integration_url=$2, integration_user=$3, updated_at=$4
        WHERE compose_id=$5`,
      [source.kind, normalizeBaseUrl(url), source.user?.trim() || null, Date.now(), match.compose_id],
    );
    if (source.secret?.trim()) await saveSecret(match.compose_id, source.secret.trim());
    await pool.query(
      "INSERT INTO settings (key, value) VALUES ($1, 'true') ON CONFLICT (key) DO NOTHING",
      [flag],
    );
    imported.push(`${source.kind} → ${match.compose_id}`);
  }
  if (imported.length > 0) await refreshServices();
  return imported;
}

try {
  await importEnvIntegrations();
} catch (error) {
  console.error("Integration import from .env failed:", error);
}
