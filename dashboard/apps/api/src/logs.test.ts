import assert from "node:assert/strict";
import test from "node:test";
import { detectLevel, parseLogLine, parseLogText } from "./logs.js";

test("detectLevel picks ERROR over WARN and defaults to INFO", () => {
  assert.equal(detectLevel("java.lang.NullPointerException thrown"), "INFO");
  assert.equal(detectLevel("Unhandled exception in worker"), "ERROR");
  assert.equal(detectLevel("FATAL: database is starting up"), "ERROR");
  assert.equal(detectLevel("warning: disk almost full, error budget ok"), "ERROR");
  assert.equal(detectLevel("WARN low memory"), "WARN");
  assert.equal(detectLevel("Completed with no errors"), "INFO");
});

test("parseLogLine splits the Docker timestamp and strips the level prefix", () => {
  assert.deepEqual(parseLogLine("2026-11-12T06:21:00.123456789Z [WARN] Plugin outdated"), {
    ts: "2026-11-12T06:21:00.123456789Z",
    level: "WARN",
    msg: "Plugin outdated",
  });
  assert.deepEqual(parseLogLine("ERROR: connection refused"), {
    ts: "",
    level: "ERROR",
    msg: "connection refused",
  });
});

test("parseLogLine removes ANSI colours and carriage returns", () => {
  const parsed = parseLogLine("\u001b[32mINFO\u001b[0m | server started\r");
  assert.equal(parsed.level, "INFO");
  assert.equal(parsed.msg, "server started");
});

test("parseLogText drops blank lines and keeps order", () => {
  const lines = parseLogText("first\n\n  \nsecond error\n");
  assert.deepEqual(
    lines.map((line) => [line.level, line.msg]),
    [
      ["INFO", "first"],
      ["ERROR", "second error"],
    ],
  );
});
