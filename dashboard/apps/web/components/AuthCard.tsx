import { Layers } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Centred auth card used by /login and /setup: logo tile, title, subtitle and
 * the form. Styled with the same theme tokens as the dashboard.
 */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex flex-col items-center gap-3">
          <span className="flex size-[34px] items-center justify-center rounded-[9px] bg-brand text-brand-foreground">
            <Layers className="size-[18px]" strokeWidth={2.2} aria-hidden="true" />
          </span>
          <div className="text-center">
            <p className="text-[15px] font-bold text-fg">StackPilot</p>
            <p className="text-xs text-muted-foreground">Custom DevOps stack</p>
          </div>
        </div>

        <div className="rounded-[14px] border border-border bg-card p-6">
          <h1 className="text-[18px] font-semibold tracking-[-0.01em] text-fg">{title}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </div>
  );
}
