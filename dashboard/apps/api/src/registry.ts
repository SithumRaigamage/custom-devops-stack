import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { pool } from "./db.js";
import { getSettings, resolveStackRoot, expandHome } from "./settings.js";
import { refreshServices, type Service, type ServiceType } from "./services.js";

const COMPOSE_CANDIDATES = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"];
const COMMAND_PATTERN = /^[a-zA-Z0-9_./:@%+=,-]+(?:\s+[a-zA-Z0-9_./:@%+=,-]+)*$/;
const ServiceInputSchema = z.object({
  id: z.string().trim().optional(),
  name: z.string().trim().min(1).max(80),
  desc: z.string().trim().max(200).optional(),
  description: z.string().trim().max(200).optional(),
  folder: z.string().trim().min(1).max(1024),
  type: z.enum(["compose", "custom"]).default("compose"),
  composeFile: z.string().trim().min(1).max(128).default("docker-compose.yml"),
  port: z.number().int().min(1).max(65535),
  url: z.string().trim().url(),
  healthUrl: z.string().trim().url().optional(),
  healthPath: z.string().trim().regex(/^\//).max(512).optional(),
  icon: z.string().trim().max(64).optional(),
  startCmd: z.string().trim().regex(COMMAND_PATTERN).optional(),
  stopCmd: z.string().trim().regex(COMMAND_PATTERN).optional(),
  restartCmd: z.string().trim().regex(COMMAND_PATTERN).optional(),
  logsCmd: z.string().trim().regex(COMMAND_PATTERN).optional(),
  startCommand: z.string().trim().regex(COMMAND_PATTERN).optional(),
  stopCommand: z.string().trim().regex(COMMAND_PATTERN).optional(),
}).strict();

export class RegistryError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "RegistryError";
  }
}

export interface RegistryService extends Service {
  relativeFolder: string;
  description: string;
  healthUrl: string;
  startCmd?: string;
  stopCmd?: string;
  restartCmd?: string;
  logsCmd?: string;
}

function commandValue(data: z.infer<typeof ServiceInputSchema>, key: "start" | "stop") {
  return data[`${key}Cmd`] ?? data[`${key}Command`];
}

async function root(): Promise<string> {
  return resolveStackRoot(await getSettings());
}

function resolveFolder(stackRoot: string, value: string): { absolute: string; label: string } {
  const expanded = expandHome(value);
  const absolute = isAbsolute(expanded) ? resolve(expanded) : resolve(stackRoot, expanded);
  const rel = relative(stackRoot, absolute);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    throw new RegistryError(400, "Folder must be inside STACK_ROOT");
  }
  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) {
    throw new RegistryError(400, `Folder "${value}" does not exist under STACK_ROOT`);
  }
  return { absolute, label: rel.split(sep).join("/") };
}

function resolveComposeFile(folder: string, requested: string): string {
  const name = basename(requested);
  if (name !== requested || !existsSync(join(folder, name))) {
    throw new RegistryError(400, `Compose file "${requested}" does not exist in the service folder`);
  }
  return name;
}

function healthUrl(data: z.infer<typeof ServiceInputSchema>): string {
  if (data.healthUrl) return data.healthUrl;
  return `${data.url.replace(/\/$/, "")}${data.healthPath ?? "/"}`;
}

function mapRow(row: {
  compose_id: string; name: string; description: string; icon: string | null; type: ServiceType;
  folder: string; working_dir: string | null; compose_file: string; port: number | null;
  url: string; health_url: string | null; start_cmd: string | null; stop_cmd: string | null;
  restart_cmd: string | null; logs_cmd: string | null; sort_order: number;
}): RegistryService {
  const workingDir = row.working_dir ?? row.folder;
  return {
    id: row.compose_id,
    name: row.name,
    desc: row.description,
    description: row.description,
    ...(row.icon ? { icon: row.icon } : {}),
    type: row.type,
    folder: workingDir,
    workingDir,
    relativeFolder: workingDir,
    composeFile: row.compose_file,
    port: row.port ?? undefined,
    url: row.url,
    health: row.health_url ?? row.url,
    healthUrl: row.health_url ?? row.url,
    ...(row.start_cmd ? { startCommand: row.start_cmd, startCmd: row.start_cmd } : {}),
    ...(row.stop_cmd ? { stopCommand: row.stop_cmd, stopCmd: row.stop_cmd } : {}),
    ...(row.restart_cmd ? { restartCommand: row.restart_cmd, restartCmd: row.restart_cmd } : {}),
    ...(row.logs_cmd ? { logsCommand: row.logs_cmd, logsCmd: row.logs_cmd } : {}),
    sortOrder: row.sort_order,
  };
}

const SELECT_COLUMNS = `compose_id,name,description,icon,type,folder,working_dir,compose_file,port,url,
  health_url,start_cmd,stop_cmd,restart_cmd,logs_cmd,sort_order`;

export async function listRegistryServices(): Promise<RegistryService[]> {
  const { rows } = await pool.query(`SELECT ${SELECT_COLUMNS} FROM services ORDER BY sort_order, compose_id`);
  const stackRoot = await root();
  return rows.map((row) => {
    const service = mapRow(row);
    const rel = relative(stackRoot, service.workingDir);
    return { ...service, relativeFolder: rel && !rel.startsWith("..") ? rel.split(sep).join("/") : service.workingDir };
  });
}

export interface RegistryFolder {
  name: string;
  folder: string;
  composeFile: string | null;
}

export async function listFolders(): Promise<RegistryFolder[]> {
  const stackRoot = await root();
  if (!existsSync(stackRoot) || !statSync(stackRoot).isDirectory()) {
    throw new RegistryError(400, `Stack root "${stackRoot}" does not exist or is not a folder`);
  }
  return readdirSync(stackRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      folder: entry.name,
      composeFile: COMPOSE_CANDIDATES.find((file) => existsSync(join(stackRoot, entry.name, file))) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function saveService(input: unknown, existingId?: string): Promise<RegistryService> {
  const parsed = ServiceInputSchema.safeParse(input);
  if (!parsed.success) throw new RegistryError(400, parsed.error.issues[0]?.message ?? "Invalid service");
  const data = parsed.data;
  const stackRoot = await root();
  const folder = resolveFolder(stackRoot, data.folder);
  const composeFile = data.type === "compose"
    ? resolveComposeFile(folder.absolute, data.composeFile)
    : data.composeFile;
  const id = existingId ?? data.id ?? data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const now = Date.now();
  const health = healthUrl(data);
  const values = [
    id, data.name, data.description ?? data.desc ?? "", data.icon ?? null, data.type,
    folder.absolute, folder.absolute, composeFile, data.port, data.url, health,
    commandValue(data, "start") ?? null, commandValue(data, "stop") ?? null,
    data.restartCmd ?? null, data.logsCmd ?? null,
  ];
  if (existingId) {
    const result = await pool.query(
      `UPDATE services SET compose_id=$1,name=$2,description=$3,icon=$4,type=$5,folder=$6,working_dir=$7,
       compose_file=$8,port=$9,url=$10,health_url=$11,health=$11,start_cmd=$12,stop_cmd=$13,
       restart_cmd=$14,logs_cmd=$15,updated_at=$16 WHERE compose_id=$17 RETURNING ${SELECT_COLUMNS}`,
      [...values, now, existingId],
    );
    if (result.rowCount === 0) throw new RegistryError(404, `Unknown service "${existingId}"`);
    await refreshServices();
    return (await listRegistryServices()).find((service) => service.id === existingId)!;
  }
  const order = await pool.query<{ next: number }>("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM services");
  try {
    await pool.query(
      `INSERT INTO services (compose_id,name,description,icon,type,folder,working_dir,compose_file,port,url,health,health_url,
       start_cmd,stop_cmd,restart_cmd,logs_cmd,sort_order,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12,$13,$14,$15,$16,$17,$17)`,
      [...values, Number(order.rows[0].next), now],
    );
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new RegistryError(409, `A service with id "${id}" already exists`);
    throw error;
  }
  await refreshServices();
  return (await listRegistryServices()).find((service) => service.id === id)!;
}

export const createService = (input: unknown) => saveService(input);
export const updateService = (id: string, input: unknown) => saveService(input, id);

export async function deleteService(id: string): Promise<void> {
  const result = await pool.query("DELETE FROM services WHERE compose_id = $1", [id]);
  if (result.rowCount === 0) throw new RegistryError(404, `Unknown service "${id}"`);
  await refreshServices();
}

export async function reorderServices(ids: string[]): Promise<void> {
  const { rows } = await pool.query<{ compose_id: string }>("SELECT compose_id FROM services");
  const known = new Set(rows.map((row) => row.compose_id));
  if (ids.length !== known.size || ids.some((id) => !known.has(id))) {
    throw new RegistryError(400, "Reorder list must contain every service exactly once");
  }
  await pool.query("BEGIN");
  try {
    for (const [index, id] of ids.entries()) {
      await pool.query("UPDATE services SET sort_order = $1, updated_at = $2 WHERE compose_id = $3", [index, Date.now(), id]);
    }
    await pool.query("COMMIT");
    await refreshServices();
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

export async function testService(input: unknown): Promise<{ folder: boolean; composeFile: boolean; health: boolean }> {
  const parsed = ServiceInputSchema.safeParse(input);
  if (!parsed.success) throw new RegistryError(400, parsed.error.issues[0]?.message ?? "Invalid service");
  const data = parsed.data;
  const folder = resolveFolder(await root(), data.folder);
  const composeFile = data.type === "compose" && existsSync(join(folder.absolute, data.composeFile));
  let health = false;
  try {
    const response = await fetch(healthUrl(data), { signal: AbortSignal.timeout(3000) });
    health = response.ok;
  } catch {
    health = false;
  }
  return { folder: true, composeFile: data.type === "custom" ? true : composeFile, health };
}
