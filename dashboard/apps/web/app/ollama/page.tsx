"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { ASSISTANT_MODEL, OLLAMA_ENDPOINT, OLLAMA_MODELS } from "@/lib/mock";

const BUTTON =
  "inline-flex h-[38px] items-center rounded-[8px] px-3 text-[13px] font-semibold";
const PRIMARY = `${BUTTON} border border-brand bg-brand text-brand-foreground`;
const GHOST = `${BUTTON} border border-border2 bg-card2 text-fg2`;

export default function OllamaPage() {
  const [loadedModel, setLoadedModel] = useState<string | null>(ASSISTANT_MODEL);

  return (
    <>
      <PageHeader title="Ollama" sub="Local models that power the assistant and Open WebUI." />

      <section
        aria-label="Ollama endpoint"
        className="flex flex-wrap items-center gap-5 rounded-[14px] border border-border bg-card p-5"
      >
        <div className="flex flex-[1_1_260px] flex-col gap-1">
          <span className="text-[13px] text-muted-foreground">Endpoint</span>
          <code className="text-[15px] text-foreground">{OLLAMA_ENDPOINT}</code>
        </div>

        <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-bg px-2.5 py-1 text-xs font-semibold text-ok">
          <span className="size-1.5 rounded-full bg-ok" />
          Reachable
        </span>

        <div className="flex flex-col gap-1">
          <span className="text-[13px] text-muted-foreground">Loaded in memory</span>
          <span className="font-semibold">{loadedModel ?? "None"}</span>
        </div>
      </section>

      <section
        aria-label="Models"
        className="flex flex-col gap-1.5 rounded-[14px] border border-border bg-card p-5"
      >
        <h2 className="mb-2 text-base font-semibold text-foreground">Installed models</h2>

        {OLLAMA_MODELS.map((model) => {
          const loaded = loadedModel === model.name;

          return (
            <div
              key={model.name}
              className="flex flex-wrap items-center gap-3.5 rounded-[10px] bg-card2 p-3"
            >
              <div className="flex flex-[1_1_220px] flex-col gap-0.5">
                <span className="font-mono text-sm font-medium text-foreground">{model.name}</span>
                <span className="text-xs text-muted-foreground">{model.use}</span>
              </div>
              <span className="min-w-16 text-[13px] text-fg2">{model.size}</span>
              <button
                type="button"
                onClick={() => setLoadedModel(loaded ? null : model.name)}
                className={loaded ? GHOST : PRIMARY}
              >
                {loaded ? "Unload" : "Load"}
              </button>
            </div>
          );
        })}
      </section>
    </>
  );
}
