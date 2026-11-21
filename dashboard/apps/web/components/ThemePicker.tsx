"use client";

import { useEffect, useMemo, useRef } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Moon, Sun } from "lucide-react";
import { THEMES, buildTheme, themeIndex } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { useTheme } from "./theme-provider";

/**
 * Theme button and popover: 50 swatches in a 10-column grid, prev/next, Light/Dark switch.
 */
export function ThemePicker({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { theme, dark, tokens, setTheme, setMode } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const index = themeIndex(theme);
  const swatches = useMemo(() => THEMES.map((t) => buildTheme(t, dark)), [dark]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  function step(delta: number) {
    setTheme(THEMES[(index + delta + THEMES.length) % THEMES.length].n);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-label={`Theme: ${theme}. Change theme`}
        className="inline-flex h-[42px] items-center gap-2.5 rounded-[10px] border border-border2 bg-card2 pl-2.5 pr-3 text-[13px] font-semibold text-foreground"
      >
        <span
          className="size-[18px] shrink-0 rounded-full border border-border2"
          style={{
            background: `linear-gradient(135deg, ${tokens.bg} 0 50%, ${tokens.accent} 50% 100%)`,
          }}
        />
        <span className="max-w-[120px] truncate">{theme}</span>
        <ChevronDown className="size-3" strokeWidth={2.4} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose a theme"
          className="absolute right-0 top-[50px] z-40 flex w-[400px] max-w-[90vw] flex-col gap-3.5 rounded-[14px] border border-border2 bg-card p-4 shadow-[var(--shadow-popover)] max-sm:fixed max-sm:inset-x-4 max-sm:bottom-4 max-sm:top-auto max-sm:w-auto max-sm:max-w-none"
        >
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Theme {index + 1} of {THEMES.length}
              </span>
              <span className="text-base font-bold text-foreground">{theme}</span>
            </div>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous theme"
              className="inline-flex size-10 items-center justify-center rounded-[9px] border border-border2 bg-card2 text-foreground"
            >
              <ChevronLeft className="size-4" strokeWidth={2.2} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next theme"
              className="inline-flex size-10 items-center justify-center rounded-[9px] border border-border2 bg-card2 text-foreground"
            >
              <ChevronRight className="size-4" strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-10 gap-1.5">
            {THEMES.map((t, i) => {
              const colors = swatches[i];
              const active = i === index;
              return (
                <button
                  key={t.n}
                  type="button"
                  onClick={() => setTheme(t.n)}
                  aria-label={t.n}
                  aria-pressed={active}
                  title={t.n}
                  className={cn(
                    "aspect-square min-h-[30px] w-full cursor-pointer rounded-[8px] p-0",
                    active
                      ? "border-2 border-foreground shadow-[0_0_0_2px_var(--card)]"
                      : "border border-border2",
                  )}
                  style={{
                    background: `linear-gradient(135deg, ${colors.bg} 0 50%, ${colors.accent} 50% 100%)`,
                  }}
                />
              );
            })}
          </div>

          <div
            role="group"
            aria-label="Mode"
            className="grid grid-cols-2 gap-1.5 rounded-[10px] border border-border bg-card2 p-1"
          >
            <button
              type="button"
              onClick={() => setMode("light")}
              aria-pressed={!dark}
              className={cn(
                "inline-flex h-[38px] items-center justify-center gap-2 rounded-[7px] border-0 text-[13px] font-semibold",
                dark ? "bg-transparent text-fg2" : "bg-brand text-brand-foreground",
              )}
            >
              <Sun className="size-[15px]" strokeWidth={2} aria-hidden="true" />
              Light
            </button>
            <button
              type="button"
              onClick={() => setMode("dark")}
              aria-pressed={dark}
              className={cn(
                "inline-flex h-[38px] items-center justify-center gap-2 rounded-[7px] border-0 text-[13px] font-semibold",
                dark ? "bg-brand text-brand-foreground" : "bg-transparent text-fg2",
              )}
            >
              <Moon className="size-[15px]" strokeWidth={2} aria-hidden="true" />
              Dark
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
