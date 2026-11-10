import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";
import type { Service } from "./services.js";

const execFileAsync = promisify(execFile);
export const COMMAND_TIMEOUT_MS = 120_000;

const expandHome = (value: string) =>
  value === "~" || value.startsWith("~/") ? homedir() + value.slice(1) : value;

export function serviceCwd(service: Service): string {
  const folder = expandHome(service.workingDir || service.folder);
  return isAbsolute(folder) ? folder : resolve(expandHome(process.env.STACK_ROOT || "."), folder);
}

export async function runCompose(
  service: Service,
  args: string[],
  timeoutMs = COMMAND_TIMEOUT_MS,
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("docker", ["compose", "-f", service.composeFile, ...args], {
    cwd: serviceCwd(service),
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });
}

/** Split a saved custom command without invoking a shell. */
export function splitCommand(command: string): string[] {
  const parts = command.match(/"[^"]*"|'[^']*'|[^\s]+/g)?.map((part) =>
    part.length >= 2 && ((part.startsWith('"') && part.endsWith('"')) || (part.startsWith("'") && part.endsWith("'")))
      ? part.slice(1, -1)
      : part,
  ) ?? [];
  if (parts.length === 0) throw new Error("Command cannot be empty");
  return parts;
}

export async function runCustomCommand(
  service: Service,
  command: string,
  timeoutMs = COMMAND_TIMEOUT_MS,
): Promise<{ stdout: string; stderr: string }> {
  const [file, ...args] = splitCommand(command);
  return execFileAsync(file, args, {
    cwd: serviceCwd(service),
    timeout: timeoutMs,
    shell: false,
    maxBuffer: 16 * 1024 * 1024,
  });
}
