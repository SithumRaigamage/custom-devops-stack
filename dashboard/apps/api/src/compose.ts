import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";
import type { Service } from "./services.js";

const execFileAsync = promisify(execFile);
export const COMMAND_TIMEOUT_MS = 120_000;

const expandHome = (value: string) =>
  value === "~" || value.startsWith("~/") ? homedir() + value.slice(1) : value;

export function serviceCwd(service: Pick<Service, "workingDir" | "folder">): string {
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

export const SHELL_PATH = "/bin/zsh";

/**
 * How a saved command is executed. Default: argv split, no shell. With run_in_shell:
 * `/bin/zsh -i -c "<command>"` so aliases and functions from ~/.zshrc work, and the
 * command runs exactly as typed.
 */
export function commandInvocation(
  command: string,
  runInShell: boolean,
): { file: string; args: string[]; mode: "exec" | "shell" } {
  if (runInShell) {
    if (!command.trim()) throw new Error("Command cannot be empty");
    return { file: SHELL_PATH, args: ["-i", "-c", command], mode: "shell" };
  }
  const [file, ...args] = splitCommand(command);
  return { file, args, mode: "exec" };
}

/** Text recorded in the audit log for a run, including the execution mode. */
export function describeInvocation(command: string, runInShell: boolean): string {
  return runInShell ? `${SHELL_PATH} -i -c ${JSON.stringify(command)}` : command;
}

export async function runCustomCommand(
  service: Pick<Service, "workingDir" | "folder" | "runInShell">,
  command: string,
  timeoutMs = COMMAND_TIMEOUT_MS,
): Promise<{ stdout: string; stderr: string }> {
  const { file, args } = commandInvocation(command, service.runInShell);
  return execFileAsync(file, args, {
    cwd: serviceCwd(service),
    timeout: timeoutMs,
    shell: false,
    maxBuffer: 16 * 1024 * 1024,
  });
}
