import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";
import { z } from "zod";
import { getSettings, resolveStackRoot, expandHome } from "./settings.js";
import type { Service } from "./services.js";

const SERVICES_FILE =
  process.env.SERVICES_FILE ??
  fileURLToPath(new URL("../../../services.yaml", import.meta.url));

const COMPOSE_CANDIDATES = [
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
];

const SERVICE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const OPERATOR_COMMANDS = [
  "jenkins-start",
  "jenkins-stop",
  "sonar-start",
  "sonar-stop",
  "mongo-start",
  "mongo-stop",
  "webui",
] as const;

const ServiceInputSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(SERVICE_ID_PATTERN, "Id must be lowercase letters, numbers and hyphens")
    .optional(),
  name: z.string().trim().min(1, "Name is required").max(80),
  desc: z.string().trim().max(200).optional(),
  folder: z.string().trim().min(1, "Folder is required").max(1024),
  composeFile: z.string().trim().min(1).max(128).optional(),
  port: z
    .number()
    .int("Port must be a whole number")
    .min(1, "Port must be between 1 and 65535")
    .max(65535, "Port must be between 1 and 65535"),
  url: z
    .string()
    .trim()
    .url("URL must be a valid http(s) URL")
    .refine((value) => /^https?:$/.test(new URL(value).protocol), {
      message: "URL must be a valid http(s) URL",
    }),
  healthPath: z
    .string()
    .trim()
    .regex(/^\//, "Health path must start with /")
    .max(512),
  icon: z.string().trim().max(64).optional(),
  startCommand: z.enum(OPERATOR_COMMANDS).optional(),
  stopCommand: z.enum(OPERATOR_COMMANDS).optional(),
});

/** An error that maps directly onto an HTTP status. */
export class RegistryError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "RegistryError";
  }
}

function readRegistry(): Service[] {
  if (!existsSync(SERVICES_FILE)) {
    throw new RegistryError(500, `services.yaml was not found at ${SERVICES_FILE}`);
  }

  const doc = parse(readFileSync(SERVICES_FILE, "utf8")) as { services?: unknown };
  if (!doc || !Array.isArray(doc.services)) {
    throw new RegistryError(500, "services.yaml must contain a top-level services list");
  }

  return doc.services as Service[];
}

/** Atomic write: a temp file next to the target, then rename over it. */
function writeRegistry(services: Service[]): void {
  const temp = `${SERVICES_FILE}.${process.pid}.${Date.now()}.tmp`;
  const body = stringify({ services }, { lineWidth: 0 });
  writeFileSync(temp, body, "utf8");
  renameSync(temp, SERVICES_FILE);
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || "service";
}

function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let index = 2;
  while (taken.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function realpathOr(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/**
 * Resolve `folder` against the stack root and prove it stays inside it.
 * Rejects absolute paths outside the root, traversal, and symlink escapes.
 */
function resolveServiceFolder(
  root: string,
  folder: string,
): { dir: string; folderLabel: string } {
  const rootReal = realpathOr(resolve(root));
  const expanded = expandHome(folder);
  const candidate = isAbsolute(expanded) ? resolve(expanded) : resolve(rootReal, expanded);

  const relativeToRoot = relative(rootReal, candidate);
  if (
    relativeToRoot === "" ||
    relativeToRoot.startsWith("..") ||
    isAbsolute(relativeToRoot)
  ) {
    throw new RegistryError(400, "Folder must be inside the stack root");
  }

  if (!existsSync(candidate) || !statSync(candidate).isDirectory()) {
    throw new RegistryError(400, `Folder "${folder}" does not exist under the stack root`);
  }

  const dir = realpathOr(candidate);
  const realRelative = relative(rootReal, dir);
  if (realRelative.startsWith("..") || isAbsolute(realRelative)) {
    throw new RegistryError(400, "Folder must be inside the stack root");
  }

  const label = realRelative.split(sep).join("/");
  return { dir, folderLabel: label };
}

/** Compose file name inside a service folder, or a 400 when none exists. */
function resolveComposeFile(dir: string, folder: string, requested?: string): string {
  if (requested) {
    const name = basename(requested);
    if (name !== requested || name === "." || name === "..") {
      throw new RegistryError(400, "Compose file must be a file name inside the folder");
    }
    if (!existsSync(join(dir, name))) {
      throw new RegistryError(400, `Compose file "${name}" does not exist in "${folder}"`);
    }
    return name;
  }

  for (const candidate of COMPOSE_CANDIDATES) {
    if (existsSync(join(dir, candidate))) return candidate;
  }

  throw new RegistryError(
    400,
    `Folder "${folder}" has no compose file (looked for ${COMPOSE_CANDIDATES.join(", ")})`,
  );
}

function withPort(url: string, port: number): string {
  const parsed = new URL(url);
  parsed.port = String(port);
  const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
  return `${parsed.origin}${path}`;
}

function withHealthPath(baseUrl: string, healthPath: string): string {
  return `${baseUrl.replace(/\/$/, "")}${healthPath.startsWith("/") ? healthPath : `/${healthPath}`}`;
}

/** Store folders as absolute paths (`~/…` when under home) so compose keeps working. */
function storedFolder(dir: string): string {
  const home = homedir();
  return dir === home || dir.startsWith(`${home}${sep}`) ? `~${dir.slice(home.length)}` : dir;
}

function toRelativeFolder(root: string, folder: string): string {
  const rootReal = realpathOr(resolve(root));
  const absolute = isAbsolute(expandHome(folder))
    ? resolve(expandHome(folder))
    : resolve(rootReal, expandHome(folder));
  const rel = relative(rootReal, realpathOr(absolute));
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel.split(sep).join("/") : folder;
}

async function currentRoot(): Promise<string> {
  return resolveStackRoot(await getSettings());
}

export interface RegistryService extends Service {
  /** Folder relative to the stack root, for the picker. */
  relativeFolder: string;
}

export async function listRegistryServices(): Promise<RegistryService[]> {
  const root = await currentRoot();
  return readRegistry().map((service) => ({
    ...service,
    relativeFolder: toRelativeFolder(root, service.folder),
  }));
}

export interface RegistryFolder {
  name: string;
  folder: string;
  composeFile: string | null;
}

/** Immediate subfolders of the stack root, flagged with a detected compose file. */
export async function listFolders(): Promise<RegistryFolder[]> {
  const root = await currentRoot();

  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new RegistryError(400, `Stack root "${root}" does not exist or is not a folder`);
  }

  const folders: RegistryFolder[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const composeFile = COMPOSE_CANDIDATES.find((name) => existsSync(join(root, entry.name, name)));
    folders.push({ name: entry.name, folder: entry.name, composeFile: composeFile ?? null });
  }

  return folders.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createService(input: unknown): Promise<Service> {
  const data = ServiceInputSchema.safeParse(input);
  if (!data.success) {
    throw new RegistryError(400, data.error.issues[0]?.message ?? "Invalid service");
  }

  const root = await currentRoot();
  const { dir, folderLabel } = resolveServiceFolder(root, data.data.folder);
  const composeFile = resolveComposeFile(dir, folderLabel, data.data.composeFile);

  const services = readRegistry();
  const taken = new Set(services.map((service) => service.id));
  const id = data.data.id ?? uniqueId(slugify(data.data.name), taken);

  if (taken.has(id)) {
    throw new RegistryError(409, `A service with id "${id}" already exists`);
  }

  const url = withPort(data.data.url, data.data.port);
  const service: Service = {
    id,
    name: data.data.name,
    desc: data.data.desc ?? "",
    image: "—",
    folder: storedFolder(dir),
    composeFile,
    url,
    health: withHealthPath(url, data.data.healthPath),
    port: data.data.port,
    ...(data.data.icon ? { icon: data.data.icon } : {}),
    ...(data.data.startCommand ? { startCommand: data.data.startCommand } : {}),
    ...(data.data.stopCommand ? { stopCommand: data.data.stopCommand } : {}),
  };

  writeRegistry([...services, service]);
  return service;
}

export async function updateService(id: string, input: unknown): Promise<Service> {
  const data = ServiceInputSchema.safeParse(input);
  if (!data.success) {
    throw new RegistryError(400, data.error.issues[0]?.message ?? "Invalid service");
  }

  const services = readRegistry();
  const index = services.findIndex((service) => service.id === id);
  if (index === -1) {
    throw new RegistryError(404, `Unknown service "${id}"`);
  }

  const root = await currentRoot();
  const { dir, folderLabel } = resolveServiceFolder(root, data.data.folder);
  const composeFile = resolveComposeFile(dir, folderLabel, data.data.composeFile);

  const url = withPort(data.data.url, data.data.port);
  const existing = services[index];
  const updated: Service = {
    ...existing,
    id,
    name: data.data.name,
    desc: data.data.desc ?? "",
    folder: storedFolder(dir),
    composeFile,
    url,
    health: withHealthPath(url, data.data.healthPath),
    port: data.data.port,
  };

  if (data.data.icon) {
    updated.icon = data.data.icon;
  } else {
    delete updated.icon;
  }
  if (data.data.startCommand) updated.startCommand = data.data.startCommand;
  else delete updated.startCommand;
  if (data.data.stopCommand) updated.stopCommand = data.data.stopCommand;
  else delete updated.stopCommand;

  const next = [...services];
  next[index] = updated;
  writeRegistry(next);
  return updated;
}

export async function deleteService(id: string): Promise<void> {
  const services = readRegistry();
  const next = services.filter((service) => service.id !== id);
  if (next.length === services.length) {
    throw new RegistryError(404, `Unknown service "${id}"`);
  }
  writeRegistry(next);
}
