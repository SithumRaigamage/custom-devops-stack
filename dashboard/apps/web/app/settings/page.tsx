"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/components/toast";
import type {
  NotificationPreferences,
  RegistryFolder,
  RegistryService,
  ServiceInput,
} from "@/lib/api";
import {
  useCreateRegistryService,
  useDeleteRegistryService,
  useRegistryFolders,
  useRegistryServices,
  useSaveSettings,
  useSettings,
  useUpdateRegistryService,
} from "@/lib/use-settings";

const INTERVAL_OPTIONS = [2, 4, 10, 30];

const TOGGLES: {
  key: keyof NotificationPreferences;
  label: string;
  hint: string;
}[] = [
  {
    key: "desktop",
    label: "Desktop notifications",
    hint: "Alert me when a service goes down or a build fails.",
  },
  {
    key: "confirmStopAll",
    label: "Confirm before Stop All",
    hint: "Ask before stopping every container at once.",
  },
  {
    key: "autoRefresh",
    label: "Auto-refresh",
    hint: "Keep health checks and charts live.",
  },
];

const ICON_OPTIONS = [
  { value: "server", label: "Server" },
  { value: "git-branch", label: "Git branch" },
  { value: "shield-check", label: "Shield" },
  { value: "message-square", label: "Chat" },
  { value: "database", label: "Database" },
  { value: "globe", label: "Globe" },
  { value: "box", label: "Box" },
];

const INPUT_CLASS =
  "h-11 w-full rounded-[10px] border border-border2 bg-field px-3.5 text-sm text-foreground";
const LABEL_CLASS = "flex flex-col gap-2 text-[13px] font-semibold";

interface SettingsForm {
  stackRoot: string;
  healthCheckIntervalSeconds: number;
  notifications: NotificationPreferences;
}

interface ServiceForm {
  name: string;
  folder: string;
  port: string;
  url: string;
  healthPath: string;
  icon: string;
}

function healthPathFor(service?: RegistryService): string {
  if (!service) return "/";
  if (service.health.startsWith(service.url)) {
    return service.health.slice(service.url.length) || "/";
  }
  try {
    return new URL(service.health).pathname || "/";
  } catch {
    return "/";
  }
}

function portFor(service?: RegistryService): string {
  if (service?.port) return String(service.port);
  try {
    const parsed = new URL(service?.url ?? "");
    if (parsed.port) return parsed.port;
  } catch {
    // Fall through to the default.
  }
  return "8080";
}

export default function SettingsPage() {
  const { toast } = useToast();
  const { data: settings, isPending, error } = useSettings();
  const saveMutation = useSaveSettings();

  const { data: services = [], isPending: servicesPending } = useRegistryServices();
  const { data: folders = [] } = useRegistryFolders();
  const deleteMutation = useDeleteRegistryService();

  const [form, setForm] = useState<SettingsForm | null>(null);
  const [editor, setEditor] = useState<
    { mode: "add" } | { mode: "edit"; service: RegistryService } | null
  >(null);

  useEffect(() => {
    if (!settings) return;
    const next: SettingsForm = {
      stackRoot: settings.stackRoot,
      healthCheckIntervalSeconds: settings.healthCheckIntervalSeconds,
      notifications: settings.notifications,
    };
    setForm((current) => current ?? next);
  }, [settings]);

  function setNotification(key: keyof NotificationPreferences, value: boolean) {
    setForm((current) =>
      current
        ? { ...current, notifications: { ...current.notifications, [key]: value } }
        : current,
    );
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!form) return;

    try {
      await saveMutation.mutateAsync({ ...form });
      toast("Settings saved");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save settings", "error");
    }
  }

  async function handleRemove(service: RegistryService) {
    const confirmed = window.confirm(
      `Remove ${service.name} from services.yaml?\n\nRunning containers and their data are not touched.`,
    );
    if (!confirmed) return;

    try {
      await deleteMutation.mutateAsync(service.id);
      toast(`${service.name} removed`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not remove the service", "error");
    }
  }

  const intervalOptions =
    form && !INTERVAL_OPTIONS.includes(form.healthCheckIntervalSeconds)
      ? [...INTERVAL_OPTIONS, form.healthCheckIntervalSeconds].sort((a, b) => a - b)
      : INTERVAL_OPTIONS;

  return (
    <>
      <PageHeader title="Settings" sub="Where your stack lives and how often it is checked." />

      {error ? (
        <section className="max-w-[760px] rounded-[14px] border border-border bg-card p-6 text-sm text-muted-foreground">
          Could not load settings. Is the API running?
        </section>
      ) : isPending || !form ? (
        <section className="max-w-[760px] rounded-[14px] border border-border bg-card p-6 text-sm text-muted-foreground">
          Loading settings…
        </section>
      ) : (
        <form
          onSubmit={handleSave}
          aria-label="Settings"
          className="flex max-w-[760px] flex-col gap-[22px] rounded-[14px] border border-border bg-card p-6"
        >
          <div className={LABEL_CLASS}>
            <label htmlFor="root">Stack root folder</label>
            <input
              id="root"
              type="text"
              value={form.stackRoot}
              onChange={(event) =>
                setForm((current) =>
                  current ? { ...current, stackRoot: event.target.value } : current,
                )
              }
              className={`${INPUT_CLASS} font-mono text-[13px]`}
            />
            <span className="text-xs font-normal text-muted-foreground">
              Each service folder inside it needs its own docker-compose.yml.
            </span>
          </div>

          <div className={LABEL_CLASS}>
            <label htmlFor="refresh">Health check interval</label>
            <select
              id="refresh"
              value={form.healthCheckIntervalSeconds}
              onChange={(event) =>
                setForm((current) =>
                  current
                    ? {
                        ...current,
                        healthCheckIntervalSeconds: Number(event.target.value),
                      }
                    : current,
                )
              }
              className={`${INPUT_CLASS} max-w-[240px]`}
            >
              {intervalOptions.map((seconds) => (
                <option key={seconds} value={seconds}>
                  Every {seconds} seconds
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            {TOGGLES.map((toggle) => {
              const on = form.notifications[toggle.key];

              return (
                <div
                  key={toggle.key}
                  className="flex items-center justify-between gap-4 border-t border-track py-3"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{toggle.label}</span>
                    <span className="text-xs text-muted-foreground">{toggle.hint}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNotification(toggle.key, !on)}
                    aria-pressed={on}
                    aria-label={toggle.label}
                    className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                      on ? "bg-brand" : "bg-border2"
                    }`}
                  >
                    <span
                      className={`absolute top-1 size-5 rounded-full transition-[left] ${
                        on ? "left-6 bg-brand-foreground" : "left-1 bg-fg2"
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="h-11 rounded-[10px] bg-brand px-[18px] text-sm font-bold text-brand-foreground disabled:opacity-60"
            >
              {saveMutation.isPending ? "Saving…" : "Save settings"}
            </button>
          </div>
        </form>
      )}

      <section
        aria-label="Manage services"
        className="mt-[22px] flex max-w-[760px] flex-col gap-4 rounded-[14px] border border-border bg-card p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="m-0 text-base font-bold text-foreground">Manage services</h2>
            <p className="m-0 text-xs text-muted-foreground">
              Add, edit or remove entries in services.yaml. Running containers are not changed.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditor({ mode: "add" })}
            className="h-10 rounded-[10px] bg-brand px-4 text-[13px] font-bold text-brand-foreground"
          >
            Add service
          </button>
        </div>

        {servicesPending ? (
          <p className="m-0 text-sm text-muted-foreground">Loading services…</p>
        ) : services.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">
            No services yet. Add one from a folder under the stack root.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-0 p-0">
            {services.map((service) => (
              <li
                key={service.id}
                className="flex flex-wrap items-center gap-3 border-t border-track py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="m-0 flex flex-wrap items-center gap-2 text-sm font-medium">
                    {service.name}
                    <span className="rounded-full bg-field px-2 py-0.5 font-mono text-[11px] font-normal text-muted-foreground">
                      {service.relativeFolder}
                    </span>
                  </p>
                  <p className="m-0 mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                    {service.url}
                    {healthPathFor(service)} · {service.composeFile}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditor({ mode: "edit", service })}
                    className="h-9 rounded-[9px] border border-border2 px-3 text-xs font-semibold text-foreground"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRemove(service)}
                    disabled={deleteMutation.isPending}
                    className="h-9 rounded-[9px] border border-bad-bg px-3 text-xs font-semibold text-bad disabled:opacity-60"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editor && (
        <ServiceDialog
          key={editor.mode === "edit" ? editor.service.id : "add"}
          service={editor.mode === "edit" ? editor.service : undefined}
          folders={folders}
          onClose={() => setEditor(null)}
          onSaved={() => {
            const wasEdit = editor.mode === "edit";
            setEditor(null);
            toast(wasEdit ? "Service updated" : "Service added");
          }}
        />
      )}
    </>
  );
}

function ServiceDialog({
  service,
  folders,
  onClose,
  onSaved,
}: {
  service?: RegistryService;
  folders: RegistryFolder[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const createMutation = useCreateRegistryService();
  const updateMutation = useUpdateRegistryService();
  const pending = createMutation.isPending || updateMutation.isPending;

  const usableFolders = folders.filter((folder) => folder.composeFile);
  const folderOptions =
    service && !usableFolders.some((folder) => folder.folder === service.relativeFolder)
      ? [
          {
            name: service.relativeFolder,
            folder: service.relativeFolder,
            composeFile: service.composeFile,
          },
          ...usableFolders,
        ]
      : usableFolders;

  const [form, setForm] = useState<ServiceForm>(() => ({
    name: service?.name ?? "",
    folder: service?.relativeFolder ?? usableFolders[0]?.folder ?? "",
    port: portFor(service),
    url: service?.url ?? "http://localhost",
    healthPath: healthPathFor(service),
    icon: service?.icon ?? "server",
  }));
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof ServiceForm>(key: K, value: ServiceForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const port = Number(form.port);
    if (!form.name.trim()) return setError("Name is required");
    if (!form.folder) return setError("Choose a service folder");
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return setError("Port must be a whole number between 1 and 65535");
    }

    const input: ServiceInput = {
      name: form.name.trim(),
      folder: form.folder,
      port,
      url: form.url.trim(),
      healthPath: form.healthPath.trim() || "/",
      icon: form.icon,
      ...(service?.desc ? { desc: service.desc } : {}),
    };

    try {
      if (service) {
        await updateMutation.mutateAsync({ id: service.id, input });
      } else {
        await createMutation.mutateAsync(input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the service");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="service-dialog-title"
        className="max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-[14px] border border-border bg-card p-6 shadow-[var(--shadow-popover)]"
      >
        <h2 id="service-dialog-title" className="m-0 text-lg font-bold text-foreground">
          {service ? `Edit ${service.name}` : "Add service"}
        </h2>
        <p className="m-0 mt-1 text-xs text-muted-foreground">
          Writes to services.yaml only.
        </p>

        <form onSubmit={(event) => void handleSubmit(event)} className="mt-5 flex flex-col gap-4">
          <label className={LABEL_CLASS}>
            Name
            <input
              type="text"
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="My service"
              className={INPUT_CLASS}
              required
            />
          </label>

          <label className={LABEL_CLASS}>
            Folder
            <select
              value={form.folder}
              onChange={(event) => update("folder", event.target.value)}
              className={INPUT_CLASS}
              required
            >
              {folderOptions.length === 0 && <option value="">No folders with a compose file</option>}
              {folderOptions.map((folder) => (
                <option key={folder.folder} value={folder.folder}>
                  {folder.name}
                </option>
              ))}
            </select>
            <span className="text-xs font-normal text-muted-foreground">
              Subfolders of the stack root that contain a compose file.
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className={LABEL_CLASS}>
              Port
              <input
                type="number"
                min={1}
                max={65535}
                value={form.port}
                onChange={(event) => update("port", event.target.value)}
                className={INPUT_CLASS}
                required
              />
            </label>

            <label className={LABEL_CLASS}>
              Icon
              <select
                value={form.icon}
                onChange={(event) => update("icon", event.target.value)}
                className={INPUT_CLASS}
              >
                {ICON_OPTIONS.map((icon) => (
                  <option key={icon.value} value={icon.value}>
                    {icon.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className={LABEL_CLASS}>
            URL
            <input
              type="url"
              value={form.url}
              onChange={(event) => update("url", event.target.value)}
              placeholder="http://localhost"
              className={INPUT_CLASS}
              required
            />
          </label>

          <label className={LABEL_CLASS}>
            Health path
            <input
              type="text"
              value={form.healthPath}
              onChange={(event) => update("healthPath", event.target.value)}
              placeholder="/health"
              className={`${INPUT_CLASS} font-mono text-[13px]`}
              required
            />
          </label>

          {error && <p className="m-0 text-[13px] text-bad">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-[10px] border border-border2 px-4 text-[13px] font-semibold text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="h-10 rounded-[10px] bg-brand px-4 text-[13px] font-bold text-brand-foreground disabled:opacity-60"
            >
              {pending ? "Saving…" : service ? "Save changes" : "Add service"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
