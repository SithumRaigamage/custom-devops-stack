import assert from "node:assert/strict";
import test from "node:test";
import { splitCommand } from "./compose.js";

test("splitCommand preserves quoted arguments without a shell", () => {
  assert.deepEqual(splitCommand(`node "scripts/start service.js" --port 4000`), [
    "node",
    "scripts/start service.js",
    "--port",
    "4000",
  ]);
});

test("splitCommand rejects empty commands", () => {
  assert.throws(() => splitCommand("   "), /cannot be empty/);
});
