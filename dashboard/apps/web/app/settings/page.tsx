"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";

const INTERVALS = ["Every 4 seconds", "Every 10 seconds", "Every 30 seconds"];

const TOGGLES = [
  {
    key: "notify",
    label: "Desktop notifications",
    hint: "Alert me when a service goes down or a build fails.",
  },
  {
    key: "confirm",
    label: "Confirm before Stop All",
    hint: "Ask before stopping every container at once.",
  },
  {
    key: "autoRefresh",
    label: "Auto-refresh",
    hint: "Keep health checks and charts live.",
  },
] as const;

type ToggleKey = (typeof TOGGLES)[number]["key"];

export default function SettingsPage() {
  const [root, setRoot] = useState("~/Other/02-DevOps-Lab/custom-devops-stack");
  const [refresh, setRefresh] = useState(INTERVALS[0]);
  const [toggles, setToggles] = useState<Record<ToggleKey, boolean>>({
    notify: true,
    confirm: true,
    autoRefresh: true,
  });
  const [saved, setSaved] = useState(false);

  function flip(key: ToggleKey, on: boolean) {
    setToggles((current) => ({ ...current, [key]: !on }));
    setSaved(false);
  }

  return (
    <>
      <PageHeader title="Settings" sub="Where your stack lives and how often it is checked." />

      <section
        aria-label="Settings"
        className="flex max-w-[760px] flex-col gap-[22px] rounded-[14px] border border-border bg-card p-6"
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="root" className="text-[13px] font-semibold">
            Stack root folder
          </label>
          <input
            id="root"
            type="text"
            value={root}
            onChange={(event) => {
              setRoot(event.target.value);
              setSaved(false);
            }}
            className="h-11 rounded-[10px] border border-border2 bg-field px-3.5 font-mono text-[13px] text-foreground"
          />
          <span className="text-xs text-muted-foreground">
            Each service folder inside it needs its own docker-compose.yml.
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="refresh" className="text-[13px] font-semibold">
            Health check interval
          </label>
          <select
            id="refresh"
            value={refresh}
            onChange={(event) => {
              setRefresh(event.target.value);
              setSaved(false);
            }}
            className="h-11 max-w-[240px] rounded-[10px] border border-border2 bg-field px-3 text-sm text-foreground"
          >
            {INTERVALS.map((interval) => (
              <option key={interval}>{interval}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          {TOGGLES.map((toggle) => {
            const on = toggles[toggle.key];

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
                  onClick={() => flip(toggle.key, on)}
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
            type="button"
            onClick={() => setSaved(true)}
            className="h-11 rounded-[10px] bg-brand px-[18px] text-sm font-bold text-brand-foreground"
          >
            Save settings
          </button>
          {saved && <span className="text-[13px] text-brand-text">Saved</span>}
        </div>
      </section>
    </>
  );
}
