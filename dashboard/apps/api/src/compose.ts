import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { promisify } from "node:util";
import type { Service } from "./services.js";

const execFileAsync = promisify(execFile);

const expandHome = (p: string) => (p === "~" || p.startsWith("~/") ? homedir() + p.slice(1) : p);

// Runs `docker compose <args>` in the service's folder. Arguments are always
// passed as an array to execFile, never through a shell.
export async function runCompose(
  service: Service,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("docker", ["compose", ...args], {
    cwd: expandHome(service.folder),
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });
}
