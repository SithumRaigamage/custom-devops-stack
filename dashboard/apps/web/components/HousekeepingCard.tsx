"use client";

import { useState } from "react";
import { Archive, HardDrive, RefreshCw, Trash2 } from "lucide-react";
import { useToast } from "@/components/toast";
import type { DiskCategory, ServiceBackups } from "@/lib/api";
import { relativeTime } from "@/lib/activity";
import {
  useCreateDockerBackup,
  useDockerBackups,
  useDockerDisk,
  useDockerPrune,
  usePrunePreview,
  useRestoreDockerBackup,
} from "@/lib/use-housekeeping";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

function usagePercent(category: DiskCategory): number {
  if (category.sizeBytes <= 0) return 0;
  return Math.min(Math.max((category.reclaimableBytes / category.sizeBytes) * 100, 0), 100);
}

export function HousekeepingCard() {
  const { toast } = useToast();
  const disk = useDockerDisk();
  const backups = useDockerBackups();
  const createBackup = useCreateDockerBackup();
  const restoreBackup = useRestoreDockerBackup();
  const prune = useDockerPrune();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const preview = usePrunePreview(confirmOpen);

  async function handleCreate(serviceId: string, serviceName: string) {
    try {
      const file = await createBackup.mutateAsync(serviceId);
      toast(`${serviceName} image backed up (${formatBytes(file.size)})`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not create the backup", "error");
    }
  }

  async function handleRestore(serviceId: string, name: string) {
    const confirmed = window.confirm(
      `Load ${name} back into Docker?\n\nThis restores the image from the tar; running containers are not restarted.`,
    );
    if (!confirmed) return;

    try {
      await restoreBackup.mutateAsync({ serviceId, name });
      toast(`Restored ${name}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not restore the backup", "error");
    }
  }

  async function handlePrune() {
    try {
      const result = await prune.mutateAsync();
      setConfirmOpen(false);
      toast(
        `Removed ${result.imagesRemoved} dangling ${
          result.imagesRemoved === 1 ? "image" : "images"
        } and cleared build cache`,
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not prune Docker data", "error");
    }
  }

  const totalPruneBytes = preview.data?.totalBytes ?? 0;

  return (
    <>
      <section
        aria-label="Housekeeping"
        className="flex flex-col gap-5 rounded-[14px] border border-border bg-card p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="m-0 flex items-center gap-2 text-base font-semibold text-foreground">
              <HardDrive className="size-4 text-muted-foreground" strokeWidth={1.9} aria-hidden="true" />
              Housekeeping
            </h2>
            <p className="m-0 text-xs text-muted-foreground">
              Docker disk usage, per-service image backups, and safe clean-up.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-border2 px-3 text-xs font-semibold text-foreground"
          >
            <Trash2 className="size-3.5" strokeWidth={2.1} aria-hidden="true" />
            Prune unused data
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {disk.error ? (
            <p className="m-0 text-sm text-bad">
              {disk.error.message.includes("docker_unavailable")
                ? "Docker isn’t running, so disk usage is unavailable."
                : `Could not read disk usage: ${disk.error.message}`}
            </p>
          ) : disk.isPending || !disk.data ? (
            <p className="m-0 text-sm text-muted-foreground">Reading Docker disk usage…</p>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[22px] font-bold tracking-[-0.02em] text-foreground">
                  {formatBytes(disk.data.sizeBytes)}
                </span>
                <span className="text-xs text-muted-foreground">
                  total · {formatBytes(disk.data.reclaimableBytes)} reclaimable
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {disk.data.categories.map((category) => {
                  const reclaimable = usagePercent(category);
                  return (
                    <div key={category.key} className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="font-medium text-foreground">{category.label}</span>
                        <span className="text-muted-foreground">{formatBytes(category.sizeBytes)}</span>
                      </div>
                      <div
                        className="flex h-2.5 overflow-hidden rounded-full bg-track"
                        role="img"
                        aria-label={`${category.label}: ${formatBytes(
                          category.sizeBytes - category.reclaimableBytes,
                        )} in use, ${formatBytes(category.reclaimableBytes)} reclaimable`}
                      >
                        <div
                          className="h-full bg-brand"
                          style={{ width: `${100 - reclaimable}%` }}
                        />
                        <div className="h-full bg-warn" style={{ width: `${reclaimable}%` }} />
                      </div>
                      <div className="flex flex-wrap justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>
                          {category.totalCount} total · {category.activeCount} active
                        </span>
                        <span>{formatBytes(category.reclaimableBytes)} reclaimable</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-4 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-brand" aria-hidden="true" /> In use
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-warn" aria-hidden="true" /> Reclaimable
                </span>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-track pt-4">
          <h3 className="m-0 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Archive className="size-4 text-muted-foreground" strokeWidth={1.9} aria-hidden="true" />
            Image backups
          </h3>
          <p className="m-0 text-xs text-muted-foreground">
            Tars live in each service folder&apos;s <code className="font-mono">backup/</code>{" "}
            directory.
          </p>

          {backups.error ? (
            <p className="m-0 text-sm text-bad">Could not read backups: {backups.error.message}</p>
          ) : backups.isPending ? (
            <p className="m-0 text-sm text-muted-foreground">Looking for backups…</p>
          ) : (backups.data ?? []).length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">
              No services are configured, so there is nothing to back up.
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-0 p-0">
              {(backups.data ?? []).map((entry) => (
                <BackupRow
                  key={entry.serviceId}
                  entry={entry}
                  backupPending={
                    createBackup.isPending && createBackup.variables === entry.serviceId
                  }
                  restorePending={restoreBackup.isPending}
                  onBackup={() => void handleCreate(entry.serviceId, entry.serviceName)}
                  onRestore={(name) => void handleRestore(entry.serviceId, name)}
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="prune-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !prune.isPending) setConfirmOpen(false);
          }}
        >
          <div className="max-h-[90vh] w-full max-w-[560px] overflow-y-auto rounded-[14px] border border-border bg-card p-6 shadow-[var(--shadow-popover)]">
            <h2 id="prune-dialog-title" className="m-0 text-lg font-bold text-foreground">
              Remove unused Docker data?
            </h2>
            <p className="m-0 mt-1 text-xs text-muted-foreground">
              Only dangling images and build cache are removed. Images used by any service in
              configured service, or by any container, are never touched.
            </p>

            {preview.error ? (
              <p className="mt-4 text-sm text-bad">
                Could not build the removal list: {preview.error.message}
              </p>
            ) : preview.isPending || !preview.data ? (
              <p className="mt-4 text-sm text-muted-foreground">Building the removal list…</p>
            ) : (
              <>
                <div className="mt-4 flex flex-col gap-2">
                  <h3 className="m-0 text-[13px] font-semibold text-foreground">
                    Dangling images ({preview.data.images.length})
                  </h3>
                  {preview.data.images.length === 0 ? (
                    <p className="m-0 text-xs text-muted-foreground">None — nothing to remove.</p>
                  ) : (
                    <ul className="m-0 flex max-h-[220px] list-none flex-col gap-1 overflow-y-auto p-0">
                      {preview.data.images.map((image) => (
                        <li
                          key={image.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] bg-card2 px-2.5 py-1.5 font-mono text-[11px]"
                        >
                          <span className="min-w-0 truncate text-fg2">
                            {image.repository}:{image.tag} · {image.id.slice(0, 12)}
                          </span>
                          <span className="text-muted-foreground">
                            {formatBytes(image.sizeBytes)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <h3 className="m-0 mt-2 text-[13px] font-semibold text-foreground">
                    Build cache
                  </h3>
                  <p className="m-0 text-xs text-muted-foreground">
                    {formatBytes(preview.data.buildCacheBytes)} reclaimable
                  </p>
                </div>

                <p className="mt-4 rounded-[10px] border border-border2 bg-card2 px-3 py-2 text-xs text-fg2">
                  Estimated reclaim: <strong>{formatBytes(totalPruneBytes)}</strong>
                </p>
              </>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={prune.isPending}
                className="h-10 rounded-[10px] border border-border2 px-4 text-[13px] font-semibold text-foreground disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handlePrune()}
                disabled={
                  prune.isPending ||
                  preview.isPending ||
                  !preview.data ||
                  totalPruneBytes === 0
                }
                className="h-10 rounded-[10px] bg-bad px-4 text-[13px] font-bold text-white disabled:opacity-60"
              >
                {prune.isPending ? "Pruning…" : `Remove ${formatBytes(totalPruneBytes)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BackupRow({
  entry,
  backupPending,
  restorePending,
  onBackup,
  onRestore,
}: {
  entry: ServiceBackups;
  backupPending: boolean;
  restorePending: boolean;
  onBackup: () => void;
  onRestore: (name: string) => void;
}) {
  const [selected, setSelected] = useState(entry.backups[0]?.name ?? "");
  const chosen = entry.backups.find((backup) => backup.name === selected) ?? entry.backups[0] ?? null;

  return (
    <li className="flex flex-wrap items-center gap-3 border-t border-track py-3">
      <div className="min-w-0 flex-1">
        <p className="m-0 flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
          {entry.serviceName}
          {chosen ? (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                chosen.imagePresent ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad"
              }`}
              title={chosen.image ?? undefined}
            >
              {chosen.imagePresent ? "Image present" : "Image missing"}
            </span>
          ) : (
            <span className="rounded-full bg-field px-2 py-0.5 text-[11px] text-muted-foreground">
              No backup
            </span>
          )}
        </p>
        <p className="m-0 mt-0.5 truncate text-[11px] text-muted-foreground">
          {chosen
            ? `${formatBytes(chosen.size)} · ${relativeTime(chosen.date)} · ${entry.backups.length} ${
                entry.backups.length === 1 ? "backup" : "backups"
              }`
            : "No tar in the service's backup/ folder yet."}
        </p>
      </div>

      {entry.backups.length > 1 ? (
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          <span className="sr-only">Backup to restore</span>
          <select
            value={chosen?.name ?? ""}
            onChange={(event) => setSelected(event.target.value)}
            className="h-9 max-w-[220px] rounded-[8px] border border-border2 bg-field px-2 font-mono text-[11px] text-foreground"
          >
            {entry.backups.map((backup) => (
              <option key={backup.name} value={backup.name}>
                {backup.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBackup}
          disabled={backupPending}
          className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-border2 px-3 text-xs font-semibold text-foreground disabled:opacity-60"
        >
          <RefreshCw
            className={backupPending ? "size-3.5 animate-spin" : "size-3.5"}
            strokeWidth={2.1}
            aria-hidden="true"
          />
          {backupPending ? "Saving…" : "Back up now"}
        </button>
        <button
          type="button"
          onClick={() => chosen && onRestore(chosen.name)}
          disabled={!chosen || restorePending}
          className="h-9 rounded-[9px] border border-border2 px-3 text-xs font-semibold text-foreground disabled:opacity-40"
        >
          Restore from backup
        </button>
      </div>
    </li>
  );
}
