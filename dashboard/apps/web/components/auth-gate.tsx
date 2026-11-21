"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { fetchAuthStatus } from "@/lib/api";
import { AppShell } from "./AppShell";

const PUBLIC_PATHS = new Set(["/login", "/setup"]);

/**
 * Single place for the redirect rules:
 *   no admin account -> /setup
 *   not signed in    -> /login
 *   signed in        -> / and no auth pages
 * Auth pages render bare; every other page renders inside the app shell.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_PATHS.has(pathname);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const status = await fetchAuthStatus();
        if (cancelled) return;

        if (status.setupRequired) {
          if (pathname !== "/setup") {
            router.replace("/setup");
            return;
          }
          setReady(true);
          return;
        }

        if (!status.authenticated) {
          if (pathname !== "/login") {
            router.replace("/login");
            return;
          }
          setReady(true);
          return;
        }

        if (isPublic) {
          router.replace("/");
          return;
        }

        setReady(true);
      } catch {
        if (cancelled) return;
        // Can't reach the API: auth pages can still render their own error.
        if (!isPublic) {
          router.replace("/login");
          return;
        }
        setReady(true);
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [pathname, isPublic, router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <span className="text-sm text-muted-foreground">Loading…</span>
      </div>
    );
  }

  if (isPublic) return <>{children}</>;

  return <AppShell>{children}</AppShell>;
}
