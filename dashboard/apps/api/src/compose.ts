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

const OPERATOR_COMMANDS = new Set([
  "jenkins-start",
  "jenkins-stop",
  "sonar-start",
  "sonar-stop",
  "mongo-start",
  "mongo-stop",
  "webui",
]);

/** Run one fixed operator command from the user's zsh configuration. */
export async function runOperatorCommand(
  command: string,
  args: string[] = [],
  timeoutMs = 5 * 60 * 1000,
): Promise<{ stdout: string; stderr: string }> {
  if (!OPERATOR_COMMANDS.has(command)) {
    throw new Error(`Unsupported operator command "${command}"`);
  }

  const commandLine = [command, ...args]
    .map((part) => {
      if (!/^[a-z-]+$/.test(part)) throw new Error("Invalid operator command argument");
      return part;
    })
    .join(" ");

  return execFileAsync("zsh", ["-lic", commandLine], {
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });
}
