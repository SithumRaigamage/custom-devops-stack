import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { pool } from "./db.js";

/** Expand a leading `~` to the current user's home directory. */
export function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/") ? homedir() + path.slice(1) : path;
}

const AlertRulesSchema = z.object({
  serviceStopped: z.boolean(),
  serviceUnhealthy: z.boolean(),
  jenkinsFailed: z.boolean(),
  sonarGateFailed: z.boolean(),
  ollamaUnreachable: z.boolean(),
});

export type AlertRules = z.infer<typeof AlertRulesSchema>;

const NotificationsSchema = z.object({
  desktop: z.boolean(),
  confirmStopAll: z.boolean(),
  autoRefresh: z.boolean(),
  rules: AlertRulesSchema,
  discordWebhookUrl: z
    .string()
    .trim()
    .max(2048)
    .refine((value) => value === "" || /^https?:\/\//i.test(value), {
      message: "Discord webhook must be an http(s) URL",
    }),
  telegramBotToken: z.string().trim().max(512),
  telegramChatId: z.string().trim().max(128),
});

export type NotificationPreferences = z.infer<typeof NotificationsSchema>;

export const SettingsSchema = z.object({
  stackRoot: z.string().trim().min(1, "Stack root is required").max(1024),
  healthCheckIntervalSeconds: z
    .number()
    .int("Health check interval must be whole seconds")
    .min(2, "Health check interval must be at least 2 seconds")
    .max(300, "Health check interval must be at most 300 seconds"),
  theme: z.string().trim().min(1, "Theme is required").max(64),
  mode: z.enum(["light", "dark"]),
  notifications: NotificationsSchema,
});

export type AppSettings = z.infer<typeof SettingsSchema>;

const NotificationsUpdateSchema = z
  .object({
    desktop: z.boolean().optional(),
    confirmStopAll: z.boolean().optional(),
    autoRefresh: z.boolean().optional(),
    rules: AlertRulesSchema.partial().optional(),
    discordWebhookUrl: z
      .string()
      .trim()
      .max(2048)
      .refine((value) => value === "" || /^https?:\/\//i.test(value), {
        message: "Discord webhook must be an http(s) URL",
      })
      .optional(),
    telegramBotToken: z.string().trim().max(512).optional(),
    telegramChatId: z.string().trim().max(128).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "No notification settings provided",
  });

export const SettingsUpdateSchema = z
  .object({
    stackRoot: SettingsSchema.shape.stackRoot.optional(),
    healthCheckIntervalSeconds: SettingsSchema.shape.healthCheckIntervalSeconds.optional(),
    theme: SettingsSchema.shape.theme.optional(),
    mode: SettingsSchema.shape.mode.optional(),
    notifications: NotificationsUpdateSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "No settings provided",
  });

export type SettingsUpdate = z.infer<typeof SettingsUpdateSchema>;

export const SETTINGS_KEY = "app";

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
  notifications: {
    desktop: true,
    confirmStopAll: true,
    autoRefresh: true,
    rules: {
      serviceStopped: true,
      serviceUnhealthy: true,
      jenkinsFailed: true,
      sonarGateFailed: true,
      ollamaUnreachable: true,
    },
    discordWebhookUrl: "",
    telegramBotToken: "",
    telegramChatId: "",
  },
};

export function resolveStackRoot(settings: AppSettings): string {
  return resolve(expandHome(settings.stackRoot));
}

/** Shape returned to clients: channel secrets are replaced by flags. */
export interface PublicSettings extends Omit<AppSettings, "notifications"> {
  notifications: Omit<NotificationPreferences, "discordWebhookUrl" | "telegramBotToken"> & {
    discordWebhookUrl: "";
    telegramBotToken: "";
  };
  channels: { discord: boolean; telegram: boolean };
}

export function publicSettings(settings: AppSettings): PublicSettings {
  return {
    ...settings,
    notifications: {
      ...settings.notifications,
      discordWebhookUrl: "",
      telegramBotToken: "",
    },
    channels: {
      discord: settings.notifications.discordWebhookUrl.trim() !== "",
      telegram:
        settings.notifications.telegramBotToken.trim() !== "" &&
        settings.notifications.telegramChatId.trim() !== "",
    },
  };
}

interface StoredSettings extends Partial<Omit<AppSettings, "notifications">> {
  notifications?: Partial<Omit<NotificationPreferences, "rules">> & {
    rules?: Partial<AlertRules>;
  };
}

function mergeDefaults(stored: StoredSettings): AppSettings {
  const notifications = stored.notifications ?? {};

  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    notifications: {
      ...DEFAULT_SETTINGS.notifications,
      ...notifications,
      rules: {
        ...DEFAULT_SETTINGS.notifications.rules,
        ...(notifications.rules ?? {}),
      },
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
    return SettingsSchema.parse(mergeDefaults(JSON.parse(raw) as StoredSettings));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function updateSettings(patch: SettingsUpdate): Promise<AppSettings> {
  const current = await getSettings();
  const notificationsPatch = patch.notifications ?? {};

  const next = SettingsSchema.parse({
    ...current,
    ...patch,
    notifications: {
      ...current.notifications,
      ...notificationsPatch,
      rules: {
        ...current.notifications.rules,
        ...(notificationsPatch.rules ?? {}),
      },
    },
  });

  await pool.query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [SETTINGS_KEY, JSON.stringify(next)],
  );

  return next;
}
