export function PageHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[26px] font-bold tracking-[-0.02em] text-foreground">{title}</h1>
        <p className="m-0 text-sm text-muted-foreground">{sub}</p>
      </div>
      <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
        <span className="size-[7px] rounded-full bg-ok animate-dot" />
        Live · refreshing every 4 s
      </span>
    </div>
  );
}
