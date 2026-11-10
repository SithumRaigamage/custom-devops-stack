export type LogLevel = "INFO" | "WARN" | "ERROR";

export interface ParsedLogLine {
  ts: string;
  level: LogLevel;
  msg: string;
}

// Docker prepends RFC3339Nano timestamps when asked to.
const TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s?/;
const ERROR_WORDS = /\b(error|err|fatal|critical|panic|exception|traceback)\b/i;
const WARN_WORDS = /\b(warn|warning)\b/i;
const ANSI = /\u001b\[[0-9;]*m/g;
const LEVEL_PREFIX =
  /^\[?(INFO|WARN|WARNING|ERROR|ERR|FATAL|CRITICAL|PANIC|DEBUG|TRACE)\]?\s*[:|\-]?\s*/i;

export function detectLevel(msg: string): LogLevel {
  if (ERROR_WORDS.test(msg)) return "ERROR";
  if (WARN_WORDS.test(msg)) return "WARN";
  return "INFO";
}

/** Turn one raw Docker log line into { ts, level, msg }. */
export function parseLogLine(raw: string): ParsedLogLine {
  const withoutAnsi = raw.replace(ANSI, "").replace(/\r$/, "");
  const match = withoutAnsi.match(TIMESTAMP);
  const ts = match?.[1] ?? "";
  const text = (match ? withoutAnsi.slice(match[0].length) : withoutAnsi).trimEnd();
  const level = detectLevel(text);

  // Drop a leading level token (or [LEVEL]) because the UI renders it separately.
  const msg = text.replace(LEVEL_PREFIX, "").trimEnd();

  return { ts, level, msg };
}

export function parseLogText(text: string): ParsedLogLine[] {
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line !== "")
    .map(parseLogLine);
}
