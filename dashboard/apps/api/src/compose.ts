import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";
import type { Service } from "./services.js";

const execFileAsync = promisify(execFile);

const expandHome = (p: string) => (p === "~" || p.startsWith("~/") ? homedir() + p.slice(1) : p);

/** Resolve a service folder relative to STACK_ROOT unless it is already absolute. */
export function serviceCwd(service: Service): string {
  const folder = expandHome(service.folder);
  if (isAbsolute(folder)) return folder;
  return resolve(expandHome(process.env.STACK_ROOT || "."), folder);
}

// Runs `docker compose <args>` in the service's folder. Arguments are always
// passed as an array to execFile, never through a shell.
export async function runCompose(
  service: Service,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("docker", ["compose", ...args], {
    cwd: serviceCwd(service),
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });
}
