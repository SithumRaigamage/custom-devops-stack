import type { IntegrationKind } from "./service-model.js";

// ---------------------------------------------------------------------------
// Integration configuration and connection probing.
// No database import: integrations.ts persists the config, this module uses it.
// ---------------------------------------------------------------------------

/** Every integration request gives up after this long. */
export const INTEGRATION_TIMEOUT_MS = 5_000;

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
