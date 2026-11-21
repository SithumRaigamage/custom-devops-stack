"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AuditLog } from "@/components/AuditLog";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/components/toast";
import { SERVICE_ICON_OPTIONS } from "@/lib/service-icons";
import {
  sendTestNotification,
  testIntegrationConnection,
  testRegistryService,
  testServiceCommand,
  type AlertRuleToggles,
  type ChannelResult,
  type CommandTestResult,
  type IntegrationKind,
  type IntegrationTestResult,
  type NotificationPreferences,
  type RegistryFolder,
  type RegistryService,
  type ServiceInput,
  type SettingsPatch,
} from "@/lib/api";
import {
  useCreateRegistryService,
  useDeleteRegistryService,
  useRegistryFolders,
  useRegistryServices,
  useSaveSettings,
  useSettings,
  useUpdateRegistryService,
  useReorderRegistryServices,
} from "@/lib/use-settings";

const INTERVAL_OPTIONS = [2, 4, 10, 30];

const TOGGLES: {
  key: "desktop" | "confirmStopAll" | "autoRefresh";
  label: string;
  hint: string;
}[] = [
  {
    key: "desktop",
    label: "Desktop notifications",
    hint: "Show a browser notification when an alert fires while this tab is hidden.",
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

const ALERT_RULES: {
  key: keyof AlertRuleToggles;
  label: string;
  hint: string;
}[] = [
  {
    key: "serviceStopped",
    label: "Service stopped unexpectedly",
    hint: "Fires when a container exits without a dashboard stop.",
  },
  {
    key: "serviceUnhealthy",
    label: "Unhealthy for over 60 seconds",
    hint: "Waits out short health-check blips before alerting.",
  },
  {
    key: "jenkinsFailed",
    label: "Jenkins build failed",
    hint: "One alert per failed build, resolved by the next successful one.",
  },
  {
    key: "sonarGateFailed",
    label: "SonarQube quality gate failed",
    hint: "Fires when a project's gate turns red.",
  },
  {
    key: "ollamaUnreachable",
    label: "Ollama unreachable",
    hint: "The local model runtime stops answering.",
  },
];

const ICON_OPTIONS = SERVICE_ICON_OPTIONS;

const INPUT_CLASS =
  "h-11 w-full rounded-[10px] border border-border2 bg-field px-3.5 text-sm text-foreground";
const LABEL_CLASS = "flex flex-col gap-2 text-[13px] font-semibold";

type SettingsTab = "general" | "audit";
const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "audit", label: "Audit log" },
];

interface SettingsForm {
  stackRoot: string;
  healthCheckIntervalSeconds: number;
  notifications: NotificationPreferences;
}

interface ServiceForm {
  name: string;
  description: string;
  folder: string;
  type: "compose" | "custom";
  composeFile: string;
  port: string;
  url: string;
  healthUrl: string;
  icon: string;
  startCmd: string;
  stopCmd: string;
  restartCmd: string;
  logsCmd: string;
  runInShell: boolean;
  integration: IntegrationKind;
  integrationUrl: string;
  integrationUser: string;
  integrationHeader: string;
  /** Write-only; blank keeps the saved credential. */
  integrationSecret: string;
}

const INTEGRATION_OPTIONS: { value: IntegrationKind; label: string; defaultUrl: string }[] = [
  { value: "none", label: "None", defaultUrl: "" },
  { value: "jenkins", label: "Jenkins", defaultUrl: "http://127.0.0.1:8080" },
  { value: "sonarqube", label: "SonarQube", defaultUrl: "http://127.0.0.1:9000" },
  { value: "ollama", label: "Ollama", defaultUrl: "http://127.0.0.1:11434" },
  { value: "generic_http", label: "Generic HTTP", defaultUrl: "http://127.0.0.1" },
];

const TEST_LABEL: Record<IntegrationTestResult["result"], string> = {
  connected: "Connected",
  wrong_token: "Wrong token",
  unreachable: "Unreachable",
  error: "Error",
};

/** Token field that never shows the stored value: "Saved" with Replace / Remove. */
function SecretField({
  label,
  saved,
  removed,
  value,
  onChange,
  onRemove,
  onUndoRemove,
  placeholder,
}: {
  label: string;
  saved: boolean;
  removed: boolean;
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
  onUndoRemove: () => void;
  placeholder?: string;
}) {
  const [replacing, setReplacing] = useState(false);

  if (saved && !removed && !replacing) {
    return (
      <div className={LABEL_CLASS}>
        {label}
        <div className="flex items-center gap-2">
          <span className="inline-flex h-11 flex-1 items-center rounded-[10px] border border-border2 bg-field px-3.5 text-sm font-normal text-muted-foreground">
            ✓ Saved (encrypted, never shown)
          </span>
          <button type="button" onClick={() => setReplacing(true)} className="h-11 rounded-[10px] border border-border2 px-3 text-[13px] font-semibold text-foreground">
            Replace
          </button>
          <button type="button" onClick={onRemove} className="h-11 rounded-[10px] border border-border2 px-3 text-[13px] font-semibold text-bad">
            Remove
          </button>
        </div>
      </div>
    );
  }

  if (saved && removed) {
    return (
      <div className={LABEL_CLASS}>
        {label}
        <div className="flex items-center gap-2 text-[13px] font-normal text-muted-foreground">
          The saved value will be removed when you save.
          <button type="button" onClick={onUndoRemove} className="font-semibold text-brand-text">
            Undo
          </button>
        </div>
      </div>
    );
  }

  return (
    <label className={LABEL_CLASS}>
      {label}
      <input
        type="password"
        autoComplete="new-password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={INPUT_CLASS}
      />
      {replacing && (
        <button
          type="button"
          onClick={() => {
            onChange("");
            setReplacing(false);
          }}
          className="self-start text-xs font-semibold text-brand-text"
        >
          Keep the saved value
        </button>
      )}
    </label>
  );
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

function channelLabel(result: ChannelResult): string {
  if (result === "sent") return "sent";
  if (result === "not_configured") return "not configured";
  return "failed";
}

export default function SettingsPage() {
  const { toast } = useToast();
  const { data: settings, isPending, error } = useSettings();
  const saveMutation = useSaveSettings();

  const { data: services = [], isPending: servicesPending } = useRegistryServices();
  const { data: folders = [] } = useRegistryFolders();
  const deleteMutation = useDeleteRegistryService();
  const reorderMutation = useReorderRegistryServices();
  const [draggedServiceId, setDraggedServiceId] = useState<string | null>(null);
  const [tab, setTab] = useState<SettingsTab>("general");

  // Deep link: /settings?tab=audit opens the Audit log.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested === "audit") setTab("audit");
  }, []);

  function selectTab(next: SettingsTab) {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "general") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  }

  const [form, setForm] = useState<SettingsForm | null>(null);
  const [dirtyChannels, setDirtyChannels] = useState({ discord: false });
  const [testPending, setTestPending] = useState(false);
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

  function setPreference(key: (typeof TOGGLES)[number]["key"], value: boolean) {
    setForm((current) =>
      current
        ? { ...current, notifications: { ...current.notifications, [key]: value } }
        : current,
    );
  }

  function setRule(key: keyof AlertRuleToggles, value: boolean) {
    setForm((current) =>
      current
        ? {
            ...current,
            notifications: {
              ...current.notifications,
              rules: { ...current.notifications.rules, [key]: value },
            },
          }
        : current,
    );
  }

  function setSecret(field: "discordWebhookUrl", value: string) {
    setDirtyChannels((current) => ({
      ...current,
      discord: true,
    }));
    setForm((current) =>
      current
        ? { ...current, notifications: { ...current.notifications, [field]: value } }
        : current,
    );
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!form) return;

    const notifications: NonNullable<SettingsPatch["notifications"]> = {
      desktop: form.notifications.desktop,
      confirmStopAll: form.notifications.confirmStopAll,
      autoRefresh: form.notifications.autoRefresh,
      rules: form.notifications.rules,
    };

    // Secrets are write-only: send them only when the user edited the field, so an
    // unrelated save never clears a stored webhook or token.
    if (dirtyChannels.discord) notifications.discordWebhookUrl = form.notifications.discordWebhookUrl;

    try {
      await saveMutation.mutateAsync({
        stackRoot: form.stackRoot,
        healthCheckIntervalSeconds: form.healthCheckIntervalSeconds,
        notifications,
      });
      setDirtyChannels({ discord: false });
      setForm((current) =>
        current
          ? {
              ...current,
              notifications: {
                ...current.notifications,
                discordWebhookUrl: "",
              },
            }
          : current,
      );
      toast("Settings saved");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save settings", "error");
    }
  }

  async function handleTest() {
    setTestPending(true);
    try {
      const result = await sendTestNotification();
      if (result.discord === "not_configured") {
        toast("Add a Discord webhook first.", "error");
      } else {
        const anySent = result.discord === "sent";
        toast(
          `Test — Discord: ${channelLabel(result.discord)}`,
          anySent ? "success" : "error",
        );
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not send the test", "error");
    } finally {
      setTestPending(false);
    }
  }

  async function handleRemove(service: RegistryService) {
    const confirmed = window.confirm(
      `Remove ${service.name}?\n\nRunning containers and their data are not touched.`,
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

      <div
        role="tablist"
        aria-label="Settings sections"
        className="mb-[22px] flex w-fit gap-1 rounded-[11px] border border-border bg-card p-1"
      >
        {SETTINGS_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`settings-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`settings-panel-${item.id}`}
            onClick={() => selectTab(item.id)}
            className={`h-8 rounded-[8px] px-3.5 text-[13px] font-semibold transition-colors ${
              tab === item.id
                ? "bg-brand text-brand-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "audit" ? (
        <div role="tabpanel" id="settings-panel-audit" aria-labelledby="settings-tab-audit">
          <AuditLog />
        </div>
      ) : (
        <div role="tabpanel" id="settings-panel-general" aria-labelledby="settings-tab-general">
          {error ? (
            <section className="max-w-[760px] rounded-[14px] border border-border bg-card p-6 text-sm text-muted-foreground">
              Could not load settings. Is the API running?
            </section>
          ) : isPending || !form || !settings ? (
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
                        onClick={() => setPreference(toggle.key, !on)}
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

              <div className="flex flex-col gap-3 border-t border-track pt-4">
                <div className="flex flex-col gap-1">
                  <h2 className="m-0 text-base font-bold text-foreground">Alert rules</h2>
                  <p className="m-0 text-xs text-muted-foreground">
                    Rules run on every status tick. Each incident opens one alert and resolves itself
                    when the service recovers.
                  </p>
                </div>

                {ALERT_RULES.map((rule) => {
                  const on = form.notifications.rules[rule.key];

                  return (
                    <div
                      key={rule.key}
                      className="flex items-center justify-between gap-4 border-t border-track py-3"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium">{rule.label}</span>
                        <span className="text-xs text-muted-foreground">{rule.hint}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setRule(rule.key, !on)}
                        aria-pressed={on}
                        aria-label={rule.label}
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

              <div className="flex flex-col gap-4 border-t border-track pt-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <h2 className="m-0 text-base font-bold text-foreground">Delivery channels</h2>
                    <p className="m-0 text-xs text-muted-foreground">
                      Optional push to Discord. Secrets stay on the API and are never
                      sent back to this page.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleTest()}
                    disabled={testPending}
                    className="h-9 rounded-[9px] border border-border2 px-3 text-xs font-semibold text-foreground disabled:opacity-60"
                  >
                    {testPending ? "Sending…" : "Send test"}
                  </button>
                </div>

                <label className={LABEL_CLASS}>
                  <span className="flex flex-wrap items-center gap-2">
                    Discord webhook URL
                    {settings.channels.discord && (
                      <span className="rounded-full bg-ok-bg px-2 py-0.5 text-[11px] font-semibold text-ok">
                        Configured
                      </span>
                    )}
                  </span>
                  <input
                    type="password"
                    autoComplete="off"
                    value={form.notifications.discordWebhookUrl}
                    onChange={(event) => setSecret("discordWebhookUrl", event.target.value)}
                    placeholder={
                      settings.channels.discord
                        ? "•••••••••••••••• saved — type to replace"
                        : "https://discord.com/api/webhooks/…"
                    }
                    className={`${INPUT_CLASS} font-mono text-[13px]`}
                  />
                  <span className="text-xs font-normal text-muted-foreground">
                    Enter a new URL to replace the saved webhook, or save an empty field to remove it.
                  </span>
                </label>

                <p className="m-0 text-xs text-muted-foreground">
                  “Send test” uses the saved channels, so save first.
                </p>
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
                  Add, edit, remove, test, and reorder services stored in the dashboard database.
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
                    draggable
                    onDragStart={() => setDraggedServiceId(service.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (!draggedServiceId || draggedServiceId === service.id) return;
                      const ids = services.map((item) => item.id);
                      const from = ids.indexOf(draggedServiceId);
                      const to = ids.indexOf(service.id);
                      ids.splice(from, 1);
                      ids.splice(to, 0, draggedServiceId);
                      setDraggedServiceId(null);
                      void reorderMutation.mutateAsync(ids).catch((err) =>
                        toast(err instanceof Error ? err.message : "Could not reorder services", "error"),
                      );
                    }}
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
        </div>
      )}

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
  const [testing, setTesting] = useState(false);

  const usableFolders = folders;
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
    description: service?.description ?? service?.desc ?? "",
    folder: service?.relativeFolder ?? usableFolders[0]?.folder ?? "",
    type: service?.type ?? "compose",
    composeFile: service?.composeFile ?? usableFolders[0]?.composeFile ?? "docker-compose.yml",
    port: portFor(service),
    url: service?.url ?? "http://localhost",
    healthUrl: service?.healthUrl ?? service?.health ?? "",
    icon: service?.icon ?? "server",
    startCmd: service?.startCmd ?? "",
    stopCmd: service?.stopCmd ?? "",
    restartCmd: service?.restartCmd ?? "",
    logsCmd: service?.logsCmd ?? "",
    runInShell: service?.runInShell ?? false,
    integration: service?.integration ?? "none",
    integrationUrl: service?.integrationUrl ?? "",
    integrationUser: service?.integrationUser ?? "",
    integrationHeader: service?.integrationHeader ?? "",
    integrationSecret: "",
  }));
  const [error, setError] = useState<string | null>(null);
  const [removeCredential, setRemoveCredential] = useState(false);
  const [connTest, setConnTest] = useState<IntegrationTestResult | null>(null);
  const [connTesting, setConnTesting] = useState(false);
  const [cmdTest, setCmdTest] = useState<(CommandTestResult & { label: string }) | null>(null);
  const [cmdTesting, setCmdTesting] = useState<string | null>(null);

  function update<K extends keyof ServiceForm>(key: K, value: ServiceForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function buildInput(): ServiceInput {
    const kind = form.integration;
    const secret = form.integrationSecret;
    return {
      name: form.name.trim(),
      description: form.description.trim(),
      folder: form.folder,
      type: form.type,
      composeFile: form.composeFile.trim() || "docker-compose.yml",
      port: Number(form.port),
      url: form.url.trim(),
      healthUrl: form.healthUrl.trim() || undefined,
      icon: form.icon,
      ...(form.startCmd ? { startCmd: form.startCmd } : {}),
      ...(form.stopCmd ? { stopCmd: form.stopCmd } : {}),
      ...(form.restartCmd ? { restartCmd: form.restartCmd } : {}),
      ...(form.logsCmd ? { logsCmd: form.logsCmd } : {}),
      runInShell: form.runInShell,
      integration: kind,
      ...(kind !== "none" ? { integrationUrl: form.integrationUrl.trim() } : {}),
      ...(kind === "jenkins" ? { integrationUser: form.integrationUser.trim() } : {}),
      ...(kind === "generic_http" && form.integrationHeader.trim()
        ? { integrationHeader: form.integrationHeader.trim() }
        : {}),
      ...(secret && kind !== "none" && kind !== "ollama" ? { integrationSecret: secret } : {}),
      ...(removeCredential ? { removeCredential: true } : {}),
    };
  }

  function chooseIntegration(kind: IntegrationKind) {
    const option = INTEGRATION_OPTIONS.find((item) => item.value === kind);
    setConnTest(null);
    setForm((current) => ({
      ...current,
      integration: kind,
      integrationUrl: current.integrationUrl || option?.defaultUrl || "",
    }));
  }

  async function handleTest() {
    setError(null);
    setTesting(true);
    try {
      // Folder / compose / health check only; integration is tested with its own button.
      const { integration: _i, integrationUrl: _u, integrationUser: _n, integrationHeader: _h, integrationSecret: _s, removeCredential: _r, ...rest } = buildInput();
      void [_i, _u, _n, _h, _s, _r];
      const result = await testRegistryService(rest);
      if (!result.folder || !result.composeFile || !result.health) {
        setError(`Test failed: folder ${result.folder ? "ok" : "missing"}, compose file ${result.composeFile ? "ok" : "missing"}, health ${result.health ? "ok" : "no response"}`);
      } else {
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Service test failed");
    } finally {
      setTesting(false);
    }
  }

  async function handleTestCommand(label: string, command: string) {
    setCmdTesting(label);
    setCmdTest(null);
    try {
      const result = await testServiceCommand({
        id: service?.id,
        folder: form.folder,
        command,
        runInShell: form.runInShell,
      });
      setCmdTest({ ...result, label });
    } catch (err) {
      setCmdTest({
        ok: false,
        mode: form.runInShell ? "shell" : "exec",
        command,
        output: "",
        error: err instanceof Error ? err.message : "Command test failed",
        label,
      });
    } finally {
      setCmdTesting(null);
    }
  }

  async function handleTestConnection() {
    if (form.integration === "none") return;
    setConnTesting(true);
    setConnTest(null);
    try {
      setConnTest(
        await testIntegrationConnection({
          serviceId: removeCredential ? undefined : service?.id,
          integration: form.integration,
          integrationUrl: form.integrationUrl.trim(),
          ...(form.integration === "jenkins" ? { integrationUser: form.integrationUser.trim() } : {}),
          ...(form.integration === "generic_http" && form.integrationHeader.trim()
            ? { integrationHeader: form.integrationHeader.trim() }
            : {}),
          ...(form.integrationSecret ? { integrationSecret: form.integrationSecret } : {}),
        }),
      );
    } catch (err) {
      setConnTest({ ok: false, result: "error", message: err instanceof Error ? err.message : "Test failed" });
    } finally {
      setConnTesting(false);
    }
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

    const input = buildInput();

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
        className="max-h-[90vh] w-full max-w-[600px] overflow-y-auto rounded-[14px] border border-border bg-card p-6 shadow-[var(--shadow-popover)]"
      >
        <h2 id="service-dialog-title" className="m-0 text-lg font-bold text-foreground">
          {service ? `Edit ${service.name}` : "Add service"}
        </h2>
        <p className="m-0 mt-1 text-xs text-muted-foreground">
          Saved in the dashboard database. Changes take effect immediately.
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
            Description
            <input
              type="text"
              value={form.description}
              onChange={(event) => update("description", event.target.value)}
              className={INPUT_CLASS}
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
              Browseable folders under the stack root.
            </span>
          </label>

          <label className={LABEL_CLASS}>
            Type
            <select
              value={form.type}
              onChange={(event) => update("type", event.target.value as ServiceForm["type"])}
              className={INPUT_CLASS}
            >
              <option value="compose">Compose</option>
              <option value="custom">Custom</option>
            </select>
          </label>

          {form.type === "compose" && (
            <label className={LABEL_CLASS}>
              Compose file
              <input
                type="text"
                value={form.composeFile}
                onChange={(event) => update("composeFile", event.target.value)}
                className={`${INPUT_CLASS} font-mono text-[13px]`}
              />
            </label>
          )}

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
            Health URL
            <input
              type="url"
              value={form.healthUrl}
              onChange={(event) => update("healthUrl", event.target.value)}
              placeholder="http://localhost:8080/health or tcp://localhost:27017"
              className={INPUT_CLASS}
              required
            />
            <span className="text-xs opacity-70">
              Use a tcp://host:port URL for services without an HTTP endpoint (databases).
            </span>
          </label>

          <div className="flex flex-col gap-2 rounded-[10px] border border-border2 bg-card2 p-3.5">
            <label className="flex items-center gap-2.5 text-[13px] font-semibold text-foreground">
              <input
                type="checkbox"
                checked={form.runInShell}
                onChange={(event) => update("runInShell", event.target.checked)}
                className="size-4"
              />
              Run commands in a shell (<code className="font-mono text-xs">/bin/zsh -i -c</code>)
            </label>
            <p className="m-0 text-xs text-muted-foreground">
              Loads your <code className="font-mono">~/.zshrc</code>, so aliases and functions work.
            </p>
            {form.runInShell && (
              <p role="note" className="m-0 rounded-[8px] border border-warn-bg bg-warn-bg px-2.5 py-2 text-xs text-warn">
                Warning: shell mode runs each command exactly as typed, with pipes, redirects and
                expansions interpreted by zsh. Only enter commands you trust. Every run is recorded
                in the audit log.
              </p>
            )}
          </div>

          {(form.type === "custom" || form.runInShell) && (
            <div className="flex flex-col gap-3">
              {form.type === "compose" && (
                <p className="m-0 text-xs text-muted-foreground">
                  Compose services use <code className="font-mono">docker compose</code> unless a
                  command below is set while shell mode is on.
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {([
                  ["startCmd", "Start command"],
                  ["stopCmd", "Stop command"],
                  ["restartCmd", "Restart command"],
                  ["logsCmd", "Logs command"],
                ] as const).map(([key, label]) => (
                  <div key={key} className={LABEL_CLASS}>
                    <label htmlFor={`cmd-${key}`}>{label}</label>
                    <div className="flex gap-2">
                      <input
                        id={`cmd-${key}`}
                        value={form[key]}
                        onChange={(event) => update(key, event.target.value)}
                        className={`${INPUT_CLASS} font-mono text-[13px]`}
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        onClick={() => void handleTestCommand(label, form[key])}
                        disabled={!form[key].trim() || cmdTesting !== null}
                        className="h-11 shrink-0 rounded-[10px] border border-border2 px-3 text-[13px] font-semibold text-foreground disabled:opacity-50"
                      >
                        {cmdTesting === label ? "Running…" : "Test"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {cmdTest && (
                <div
                  role="status"
                  className={`rounded-[10px] border p-3 text-xs ${cmdTest.ok ? "border-ok/40 bg-ok-bg" : "border-bad/40 bg-bad-bg"}`}
                >
                  <div className="font-semibold text-foreground">
                    {cmdTest.label}: {cmdTest.ok ? "succeeded" : "failed"} ·{" "}
                    {cmdTest.mode === "shell" ? "zsh -i -c" : "no shell"}
                  </div>
                  {cmdTest.error && <div className="mt-1 text-bad">{cmdTest.error}</div>}
                  {cmdTest.output && (
                    <pre className="m-0 mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-foreground">
                      {cmdTest.output}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}

          <fieldset className="m-0 flex flex-col gap-4 rounded-[10px] border border-border2 p-3.5">
            <legend className="px-1.5 text-[13px] font-semibold text-foreground">Integration</legend>
            <label className={LABEL_CLASS}>
              Type
              <select
                value={form.integration}
                onChange={(event) => chooseIntegration(event.target.value as IntegrationKind)}
                className={INPUT_CLASS}
              >
                {INTEGRATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {form.integration !== "none" && (
              <>
                <label className={LABEL_CLASS}>
                  Base URL
                  <input
                    type="url"
                    value={form.integrationUrl}
                    onChange={(event) => update("integrationUrl", event.target.value)}
                    className={INPUT_CLASS}
                    required
                  />
                  <span className="text-xs font-normal text-muted-foreground">
                    localhost is switched to 127.0.0.1 automatically.
                  </span>
                </label>

                {form.integration === "jenkins" && (
                  <label className={LABEL_CLASS}>
                    Username
                    <input
                      value={form.integrationUser}
                      onChange={(event) => update("integrationUser", event.target.value)}
                      autoComplete="off"
                      className={INPUT_CLASS}
                      required
                    />
                  </label>
                )}

                {form.integration === "generic_http" && (
                  <label className={LABEL_CLASS}>
                    Header name (optional)
                    <input
                      value={form.integrationHeader}
                      onChange={(event) => update("integrationHeader", event.target.value)}
                      placeholder="Authorization"
                      autoComplete="off"
                      className={INPUT_CLASS}
                    />
                  </label>
                )}

                {(form.integration === "jenkins" || form.integration === "sonarqube" || form.integration === "generic_http") && (
                  <SecretField
                    label={
                      form.integration === "generic_http" ? "Header value (optional)" : "API token"
                    }
                    saved={Boolean(service?.credentialSaved)}
                    removed={removeCredential}
                    value={form.integrationSecret}
                    onChange={(value) => update("integrationSecret", value)}
                    onRemove={() => setRemoveCredential(true)}
                    onUndoRemove={() => setRemoveCredential(false)}
                  />
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void handleTestConnection()}
                    disabled={connTesting || !form.integrationUrl.trim()}
                    className="h-10 rounded-[10px] border border-border2 px-4 text-[13px] font-semibold text-foreground disabled:opacity-60"
                  >
                    {connTesting ? "Testing…" : "Test connection"}
                  </button>
                  {connTest && (
                    <span
                      role="status"
                      className={`text-[13px] font-semibold ${connTest.ok ? "text-ok" : "text-bad"}`}
                    >
                      {TEST_LABEL[connTest.result]}
                      {connTest.ok ? "" : `: ${connTest.message}`}
                    </span>
                  )}
                </div>
              </>
            )}
          </fieldset>

          {error && <p className="m-0 text-[13px] text-bad">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => void handleTest()}
              disabled={pending || testing}
              className="h-10 rounded-[10px] border border-border2 px-4 text-[13px] font-semibold text-foreground disabled:opacity-60"
            >
              {testing ? "Testing…" : "Test"}
            </button>
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
