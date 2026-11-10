import { execFile } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import {
  getDocker,
  isDockerAvailable,
  listContainersByProject,
  projectNameForFolder,
} from "./docker.js";
import { serviceCwd } from "./compose.js";
import { loadServices, type Service } from "./services.js";

const execFileAsync = promisify(execFile);

const DF_TIMEOUT_MS = 20_000;
const IMAGE_TIMEOUT_MS = 10 * 60 * 1000;
const PRUNE_TIMEOUT_MS = 5 * 60 * 1000;

export class HousekeepingError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HousekeepingError";
  }
}

// ---------------------------------------------------------------------------
// Disk usage
// ---------------------------------------------------------------------------

export type DiskCategoryKey = "images" | "containers" | "volumes" | "buildCache";

export interface DiskCategory {
  key: DiskCategoryKey;
  label: string;
  totalCount: number;
  activeCount: number;
  sizeBytes: number;
  reclaimableBytes: number;
}

export interface DiskUsage {
  categories: DiskCategory[];
  sizeBytes: number;
  reclaimableBytes: number;
}

const DISK_LABELS: Record<DiskCategoryKey, string> = {
  images: "Images",
  containers: "Containers",
  volumes: "Volumes",
  buildCache: "Build cache",
};

/** Docker's human sizes use decimal units, e.g. "15.71GB" or "4.983GB (31%)". */
function parseDockerSize(value: unknown): number {
  const text = String(value ?? "").trim();
  const match = text.match(/^([\d.]+)\s*([a-z]+)/i);
  if (!match) return 0;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return 0;

  const units = ["b", "kb", "mb", "gb", "tb", "pb"];
  const exponent = units.indexOf(match[2].toLowerCase());
  return Math.round(amount * 1000 ** Math.max(exponent, 0));
}

function categoryKey(type: string): DiskCategoryKey | null {
  switch (type) {
    case "Images":
      return "images";
    case "Containers":
      return "containers";
    case "Local Volumes":
      return "volumes";
    case "Build Cache":
      return "buildCache";
    default:
      return null;
  }
}

export async function readDiskUsage(): Promise<DiskUsage> {
  const { stdout } = await execFileAsync(
    "docker",
    ["system", "df", "--format", "{{json .}}"],
    { timeout: DF_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
  );

  const byKey = new Map<DiskCategoryKey, DiskCategory>();

  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }

    const key = categoryKey(String(row.Type ?? ""));
    if (!key) continue;

    byKey.set(key, {
      key,
      label: DISK_LABELS[key],
      totalCount: Number(row.TotalCount ?? 0) || 0,
      activeCount: Number(row.Active ?? 0) || 0,
      sizeBytes: parseDockerSize(row.Size),
      reclaimableBytes: parseDockerSize(row.Reclaimable),
    });
  }

  const categories: DiskCategory[] = (["images", "containers", "volumes", "buildCache"] as const)
    .map((key) => byKey.get(key))
    .filter((category): category is DiskCategory => category !== undefined);

  return {
    categories,
    sizeBytes: categories.reduce((total, category) => total + category.sizeBytes, 0),
    reclaimableBytes: categories.reduce((total, category) => total + category.reclaimableBytes, 0),
  };
}

// ---------------------------------------------------------------------------
// Image backups
// ---------------------------------------------------------------------------

export interface BackupFile {
  name: string;
  size: number;
  date: number;
  image: string | null;
  imagePresent: boolean;
}

export interface ServiceBackups {
  serviceId: string;
  serviceName: string;
  folder: string;
  backups: BackupFile[];
}

interface BackupMeta {
  serviceId?: string;
  image?: string;
  createdAt?: number;
}

function backupDir(service: Service): string {
  return join(serviceCwd(service), "backup");
}

function readBackupMeta(tarPath: string): BackupMeta | null {
  const metaPath = tarPath.replace(/\.tar$/, ".json");
  try {
    const parsed = JSON.parse(readFileSync(metaPath, "utf8")) as BackupMeta;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function findService(serviceId: string): Service {
  const service = loadServices().find((entry) => entry.id === serviceId);
  if (!service) throw new HousekeepingError(404, `Unknown service "${serviceId}"`);
  return service;
}

function composeImageNames(service: Service): string[] {
  try {
    const text = readFileSync(join(serviceCwd(service), service.composeFile), "utf8");
    return [...text.matchAll(/^\s*image:\s*["']?([^"'\s#]+)/gm)].map((match) => match[1]);
  } catch {
    return [];
  }
}

/** Prefer the image a container is actually using, then services.yaml, then compose. */
async function resolveServiceImage(service: Service): Promise<string | null> {
  try {
    const byProject = await listContainersByProject();
    const container = byProject.get(projectNameForFolder(service.folder))?.[0];
    if (container?.Image) return container.Image;
  } catch {
    // Docker unavailable: fall back to configured values.
  }

  const configured = service.image?.trim();
  if (configured && configured !== "—") return configured;

  return composeImageNames(service)[0] ?? null;
}

async function imageIsPresent(image: string | null): Promise<boolean> {
  if (!image) return false;
  try {
    await getDocker().getImage(image).inspect();
    return true;
  } catch {
    return false;
  }
}

export async function listDockerBackups(): Promise<ServiceBackups[]> {
  const services = loadServices();
  const presence = new Map<string, boolean>();

  const present = async (image: string | null): Promise<boolean> => {
    if (!image) return false;
    const cached = presence.get(image);
    if (cached !== undefined) return cached;
    const result = await imageIsPresent(image);
    presence.set(image, result);
    return result;
  };

  return Promise.all(
    services.map(async (service) => {
      const dir = backupDir(service);
      let names: string[] = [];

      try {
        names = readdirSync(dir).filter((name) => name.endsWith(".tar"));
      } catch {
        // No backup/ directory yet.
      }

      const backups = (
        await Promise.all(
          names.map(async (name): Promise<BackupFile | null> => {
            try {
              const path = join(dir, name);
              const info = statSync(path);
              if (!info.isFile()) return null;

              const meta = readBackupMeta(path);
              const configured = service.image?.trim();
              const image =
                meta?.image ??
                (configured && configured !== "—" ? configured : null);

              return {
                name,
                size: info.size,
                date: info.mtimeMs,
                image,
                imagePresent: await present(image),
              };
            } catch {
              return null;
            }
          }),
        )
      ).filter((backup): backup is BackupFile => backup !== null);

      backups.sort((a, b) => b.date - a.date);

      return {
        serviceId: service.id,
        serviceName: service.name,
        folder: dir,
        backups,
      };
    }),
  );
}

export async function createImageBackup(serviceId: string): Promise<BackupFile> {
  const service = findService(serviceId);

  if (!(await isDockerAvailable())) {
    throw new HousekeepingError(503, "Docker is not running");
  }

  const image = await resolveServiceImage(service);
  if (!image) {
    throw new HousekeepingError(400, `No image is configured for ${service.name}`);
  }

  if (!(await imageIsPresent(image))) {
    throw new HousekeepingError(400, `Image "${image}" is not present locally`);
  }

  const dir = backupDir(service);
  mkdirSync(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const name = `${service.id}-${stamp}.tar`;
  const finalPath = join(dir, name);
  const tempPath = join(dir, `.${name}.${process.pid}.tmp`);

  try {
    // `docker save` writes straight to disk so multi-GB images never sit in memory.
    await execFileAsync("docker", ["save", "--output", tempPath, image], {
      timeout: IMAGE_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });
    renameSync(tempPath, finalPath);

    writeFileSync(
      join(dir, `${name}.json`),
      JSON.stringify({ serviceId: service.id, image, createdAt: Date.now() }),
      "utf8",
    );
  } catch (error) {
    rmSync(tempPath, { force: true });
    const message = error instanceof Error ? error.message : String(error);
    throw new HousekeepingError(500, `Could not save image "${image}": ${message}`);
  }

  const info = statSync(finalPath);
  return {
    name,
    size: info.size,
    date: info.mtimeMs,
    image,
    imagePresent: true,
  };
}

export async function restoreImageBackup(
  serviceId: string,
  requestedName: unknown,
): Promise<{ ok: true; output: string }> {
  const service = findService(serviceId);

  if (!(await isDockerAvailable())) {
    throw new HousekeepingError(503, "Docker is not running");
  }

  const name = typeof requestedName === "string" ? requestedName : "";
  if (!name || basename(name) !== name || !name.endsWith(".tar")) {
    throw new HousekeepingError(400, "Backup name must be a .tar file in the service's backup folder");
  }

  const dir = backupDir(service);
  const path = join(dir, name);

  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new HousekeepingError(404, `Backup "${name}" was not found`);
  }

  try {
    const { stdout, stderr } = await execFileAsync("docker", ["load", "--input", path], {
      timeout: IMAGE_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { ok: true, output: `${stdout}${stderr}`.trim() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new HousekeepingError(500, `Could not restore "${name}": ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Prune: dangling images + build cache only
// ---------------------------------------------------------------------------

export interface DanglingImage {
  id: string;
  repository: string;
  tag: string;
  sizeBytes: number;
  createdSince: string;
}

export interface PrunePreview {
  images: DanglingImage[];
  buildCacheBytes: number;
  totalBytes: number;
}

export interface PruneResult {
  imagesRemoved: number;
  imagesSkipped: string[];
  buildCacheBytes: number;
  output: string;
}

async function listDanglingImages(): Promise<DanglingImage[]> {
  const { stdout } = await execFileAsync(
    "docker",
    ["images", "--filter", "dangling=true", "--format", "{{json .}}"],
    { timeout: DF_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
  );

  const images: DanglingImage[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as Record<string, unknown>;
      const id = String(row.ID ?? "").trim();
      if (!id) continue;

      images.push({
        id,
        repository: String(row.Repository ?? "<none>"),
        tag: String(row.Tag ?? "<none>"),
        sizeBytes: parseDockerSize(row.Size),
        createdSince: String(row.CreatedSince ?? ""),
      });
    } catch {
      // Ignore a malformed line rather than aborting the whole preview.
    }
  }

  return images;
}

interface ProtectedImages {
  ids: string[];
  names: Set<string>;
}

/**
 * Every image any service or container can be using. A dangling image is unused
 * by definition, but prune still refuses to touch any of these IDs.
 */
async function protectedImages(): Promise<ProtectedImages> {
  const ids = new Set<string>();
  const names = new Set<string>();

  try {
    const containers = await getDocker().listContainers({ all: true });
    for (const container of containers) {
      if (container.ImageID) ids.add(container.ImageID);
      if (container.Image) names.add(container.Image);
    }
  } catch {
    // Docker handles the hard failure in the routes; collect what we can.
  }

  for (const service of loadServices()) {
    const configured = service.image?.trim();
    if (configured && configured !== "—") names.add(configured);
    for (const image of composeImageNames(service)) names.add(image);
  }

  for (const name of names) {
    try {
      const info = await getDocker().getImage(name).inspect();
      if (info.Id) ids.add(info.Id);
    } catch {
      // Not present locally: nothing to protect.
    }
  }

  return { ids: [...ids], names };
}

function isProtected(image: DanglingImage, protectedRefs: ProtectedImages): boolean {
  if (protectedRefs.names.has(image.id)) return true;
  return protectedRefs.ids.some(
    (id) => id === image.id || id.startsWith(image.id) || image.id.startsWith(id),
  );
}

export async function prunePreview(): Promise<PrunePreview> {
  const [images, disk, protectedRefs] = await Promise.all([
    listDanglingImages(),
    readDiskUsage(),
    protectedImages(),
  ]);

  const removable = images.filter((image) => !isProtected(image, protectedRefs));
  const buildCacheBytes =
    disk.categories.find((category) => category.key === "buildCache")?.reclaimableBytes ?? 0;

  return {
    images: removable,
    buildCacheBytes,
    totalBytes:
      removable.reduce((total, image) => total + image.sizeBytes, 0) + buildCacheBytes,
  };
}

export async function pruneDangling(): Promise<PruneResult> {
  // Recompute protection at execution time, not just when the dialog opened.
  const protectedRefs = await protectedImages();
  const images = await listDanglingImages();

  const skipped: string[] = [];
  let imagesRemoved = 0;

  for (const image of images) {
    if (isProtected(image, protectedRefs)) {
      skipped.push(image.id);
      continue;
    }

    try {
      await execFileAsync("docker", ["rmi", image.id], {
        timeout: 60_000,
        maxBuffer: 1024 * 1024,
      });
      imagesRemoved += 1;
    } catch {
      skipped.push(image.id);
    }
  }

  let output = "";
  try {
    const result = await execFileAsync("docker", ["builder", "prune", "-f"], {
      timeout: PRUNE_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
    });
    output = `${result.stdout}${result.stderr}`.trim();
  } catch (error) {
    output = error instanceof Error ? error.message : String(error);
  }

  const disk = await readDiskUsage().catch(() => null);
  const buildCacheBytes =
    disk?.categories.find((category) => category.key === "buildCache")?.reclaimableBytes ?? 0;

  return { imagesRemoved, imagesSkipped: skipped, buildCacheBytes, output };
}
