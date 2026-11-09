import type { ReactNode } from "react";
import { ACTIVITY } from "@/lib/mock";
import { SearchProvider } from "./search-provider";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

/** Sidebar + content column. The sidebar stacks above the content on narrow screens. */
export function AppShell({
  children,
  unhealthyCount,
}: {
  children: ReactNode;
  unhealthyCount?: number;
}) {
  return (
    <div className="flex min-h-screen flex-wrap">
      <SearchProvider>
        <Sidebar unhealthyCount={unhealthyCount} />
        <div className="flex min-w-0 flex-[999_1_560px] flex-col">
          <TopBar notifications={ACTIVITY} />
          <main className="flex w-full max-w-[1360px] flex-col gap-6 p-7">{children}</main>
        </div>
      </SearchProvider>
    </div>
  );
}
