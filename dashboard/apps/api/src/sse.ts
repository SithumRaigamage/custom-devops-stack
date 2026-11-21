import type { ServerResponse } from "node:http";

// ---------------------------------------------------------------------------
// Server-sent events
// ---------------------------------------------------------------------------

const clients = new Set<ServerResponse>();
let heartbeat: NodeJS.Timeout | null = null;

function ensureHeartbeat(): void {
  if (heartbeat) return;
  heartbeat = setInterval(() => {
    for (const res of clients) {
      if (!res.writableEnded) res.write(": ping\n\n");
    }
  }, 15000);
  heartbeat.unref?.();
}

export function addEventClient(res: ServerResponse): () => void {
  clients.add(res);
  ensureHeartbeat();

  return () => {
    clients.delete(res);
  };
}

export function broadcast(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    if (!res.writableEnded) res.write(payload);
  }
}
