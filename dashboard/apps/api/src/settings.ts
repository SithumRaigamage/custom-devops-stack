import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { pool } from "./db.js";

/** Expand a leading `~` to the current user's home directory. */
export function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/") ? homedir() + path.slice(1) : path;
}

export const SettingsSchema = z.object({
  stackRoot: z.string().trim().min(1, "Stack root is required").max(1024),
  healthCheckIntervalSeconds: z
    .number()
    .int("Health check interval must be whole seconds")
    .min(2, "Health check interval must be at least 2 seconds")
    .max(300, "Health check interval must be at most 300 seconds"),
  theme: z.string().trim().min(1, "Theme is required").max(64),
  mode: z.enum(["light", "dark"]),
  notifications: z.object({
    desktop: z.boolean(),
    confirmStopAll: z.boolean(),
    autoRefresh: z.boolean(),
  }),
});

export type AppSettings = z.infer<typeof SettingsSchema>;

export const SettingsUpdateSchema = SettingsSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "No settings provided" },
);

export type SettingsUpdate = z.infer<typeof SettingsUpdateSchema>;

const SETTINGS_KEY = "app";

/** The stack root defaults to the folder that contains the dashboard and services.yaml. */
function defaultStackRoot(): string {
  const configured = process.env.STACK_ROOT?.trim();
  if (configured && configured !== ".") return resolve(expandHome(configured));

  const servicesFile =
    process.env.SERVICES_FILE ??
    fileURLToPath(new URL("../../../services.yaml", import.meta.url));
  return dirname(dirname(servicesFile));
}

export const DEFAULT_SETTINGS: AppSettings = {
  stackRoot: defaultStackRoot(),
  healthCheckIntervalSeconds: 4,
  theme: "Midnight Teal",
  mode: "dark",
  notifications: { desktop: true, confirmStopAll: true, autoRefresh: true },
};

export function resolveStackRoot(settings: AppSettings): string {
  return resolve(expandHome(settings.stackRoot));
}

function mergeDefaults(stored: Partial<AppSettings>): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    notifications: {
      ...DEFAULT_SETTINGS.notifications,
      ...(stored.notifications ?? {}),
    },
  };
}

export async function getSettings(): Promise<AppSettings> {
  const { rows } = await pool.query<{ value: string }>(
    "SELECT value FROM settings WHERE key = $1",
    [SETTINGS_KEY],
  );

  const raw = rows[0]?.value;
  if (!raw) return DEFAULT_SETTINGS;

  try {
    const parsed = SettingsSchema.parse(mergeDefaults(JSON.parse(raw) as Partial<AppSettings>));
    return parsed;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function updateSettings(patch: SettingsUpdate): Promise<AppSettings> {
  const current = await getSettings();
  const next = SettingsSchema.parse({
    ...current,
    ...patch,
    notifications: {
      ...current.notifications,
      ...(patch.notifications ?? {}),
    },
  });

  await pool.query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [SETTINGS_KEY, JSON.stringify(next)],
  );

  return next;
}
