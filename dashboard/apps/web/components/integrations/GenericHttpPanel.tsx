"use client";

import { useState } from "react";
import { testIntegrationConnection } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

/** Generic HTTP integration: checks the endpoint with the saved header (if any). */
export function GenericHttpPanel({ serviceId, baseUrl }: { serviceId: string; baseUrl?: string }) {
  const [nonce, setNonce] = useState(0);
  const check = useQuery({
    queryKey: ["generic-http", serviceId, nonce],
    queryFn: () =>
      testIntegrationConnection({
        serviceId,
        integration: "generic_http",
        integrationUrl: baseUrl ?? "",
      }),
    enabled: Boolean(baseUrl),
    retry: false,
  });

  return (
    <section className="flex flex-wrap items-center gap-4 rounded-[14px] border border-border bg-card p-5">
      <div className="flex flex-[1_1_260px] flex-col gap-1">
        <span className="text-[13px] text-muted-foreground">Endpoint</span>
        <code className="break-all text-[15px] text-foreground">{baseUrl ?? "—"}</code>
      </div>
      <span
        className={
          check.data?.ok
            ? "rounded-full bg-ok-bg px-2.5 py-1 text-xs font-semibold text-ok"
            : "rounded-full bg-bad-bg px-2.5 py-1 text-xs font-semibold text-bad"
        }
      >
        {check.isPending ? "Checking…" : check.data?.message ?? "Unknown"}
      </span>
      <button
        type="button"
        onClick={() => setNonce((n) => n + 1)}
        className="inline-flex h-[38px] items-center rounded-[8px] border border-border2 bg-card2 px-3 text-[13px] font-semibold text-fg2"
      >
        Check again
      </button>
    </section>
  );
}
