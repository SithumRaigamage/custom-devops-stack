import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { pool } from "./db.js";
import { refreshServices, type IntegrationKind } from "./services.js";

/** Every integration request gives up after this long. */
export const INTEGRATION_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Credential encryption (AES-256-GCM, key derived from SESSION_SECRET)
// ---------------------------------------------------------------------------

function deriveKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "stackpilot", "service-credentials-v1", 32));
}

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET is not set");
  return secret;
}

export function encryptSecret(plain: string, secret = sessionSecret()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), body.toString("base64")].join(":");
}

export function decryptSecret(payload: string, secret = sessionSecret()): string {
  const [version, iv, tag, body] = payload.split(":");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Unsupported credential format");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface IntegrationConfig {
  serviceId: string;
  kind: IntegrationKind;
  baseUrl: string;
  username?: string;
  /** API token, or the header value for generic_http. */
  secret?: string;
  headerName?: string;
}

/** Strip trailing slashes and use 127.0.0.1 for localhost (avoids IPv6 `::1` "fetch failed"). */
export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  try {
    const url = new URL(trimmed);
    if (url.hostname === "localhost") url.hostname = "127.0.0.1";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return trimmed;
  }
}

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
// Fetch with real error messages
// ---------------------------------------------------------------------------

export type ProbeResult = "connected" | "wrong_token" | "unreachable" | "error";

export class IntegrationError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly result: ProbeResult = "error",
  ) {
    super(message);
    this.name = "IntegrationError";
  }
}

/** Turn a failed fetch (undici wraps the real reason in `cause`) into a readable message. */
export function describeFetchError(error: unknown, target = ""): string {
  const err = error as { name?: string; message?: string; cause?: { code?: string; message?: string } };
  const where = target ? ` (${target})` : "";
  if (err?.name === "TimeoutError" || err?.name === "AbortError") {
    return `Timed out after ${INTEGRATION_TIMEOUT_MS / 1000}s${where}`;
  }
  switch (err?.cause?.code) {
    case "ECONNREFUSED":
      return `Connection refused${where}`;
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return `Host not found${where}`;
    case "ECONNRESET":
      return `Connection reset${where}`;
    case "ETIMEDOUT":
      return `Timed out${where}`;
    case "EHOSTUNREACH":
    case "ENETUNREACH":
      return `Host unreachable${where}`;
  }
  return err?.cause?.message || err?.message || "Unknown network error";
}

export function statusMessage(status: number): string {
  if (status === 401) return "Wrong token or credentials (401 Unauthorized)";
  if (status === 403) return "Forbidden (403): the token is wrong or lacks permission";
  if (status === 404) return "Not found (404): check the base URL";
  return `HTTP ${status}`;
}

function authHeaders(config: IntegrationConfig): Record<string, string> {
  switch (config.kind) {
    case "jenkins":
      return config.username && config.secret
        ? { Authorization: `Basic ${Buffer.from(`${config.username}:${config.secret}`).toString("base64")}` }
        : {};
    case "sonarqube":
      return config.secret ? { Authorization: `Bearer ${config.secret}` } : {};
    case "generic_http":
      return config.headerName && config.secret ? { [config.headerName]: config.secret } : {};
    default:
      return {};
  }
}

/** Request a path on an integration. Throws IntegrationError with a specific message on any failure. */
export async function integrationFetch(
  config: IntegrationConfig,
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = INTEGRATION_TIMEOUT_MS, headers, ...rest } = init;
  const url = `${config.baseUrl}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: { Accept: "application/json", ...authHeaders(config), ...(headers as Record<string, string>) },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const host = new URL(config.baseUrl).host;
    throw new IntegrationError(502, describeFetchError(error, host), "unreachable");
  }
  if (res.status === 401 || res.status === 403) {
    throw new IntegrationError(res.status, statusMessage(res.status), "wrong_token");
  }
  if (!res.ok) throw new IntegrationError(res.status, statusMessage(res.status));
  return res;
}

// ---------------------------------------------------------------------------
// Test connection
// ---------------------------------------------------------------------------

export interface ProbeOutcome {
  ok: boolean;
  result: ProbeResult;
  message: string;
}

export async function testConnection(config: IntegrationConfig): Promise<ProbeOutcome> {
  try {
    switch (config.kind) {
      case "jenkins": {
        if (!config.username || !config.secret) {
          return { ok: false, result: "wrong_token", message: "Username and API token are required" };
        }
        await integrationFetch(config, "/api/json?tree=mode");
        break;
      }
      case "sonarqube": {
        const res = await integrationFetch(config, "/api/authentication/validate");
        const body = (await res.json().catch(() => ({}))) as { valid?: boolean };
        if (body.valid !== true) {
          return {
            ok: false,
            result: "wrong_token",
            message: config.secret
              ? "Wrong token (SonarQube rejected it)"
              : "A token is required",
          };
        }
        break;
      }
      case "ollama":
        await integrationFetch(config, "/api/version");
        break;
      case "generic_http":
        await integrationFetch(config, "/", { headers: { Accept: "*/*" } });
        break;
      default:
        return { ok: false, result: "error", message: "No integration selected" };
    }
    return { ok: true, result: "connected", message: "Connected" };
  } catch (error) {
    if (error instanceof IntegrationError) {
      return { ok: false, result: error.result, message: error.message };
    }
    return { ok: false, result: "error", message: error instanceof Error ? error.message : String(error) };
  }
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
