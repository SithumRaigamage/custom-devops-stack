import assert from "node:assert/strict";
import { createServer } from "node:net";
import test from "node:test";
import { checkHealth } from "./status.js";

test("tcp health check succeeds when a port is listening and fails when closed", async () => {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as { port: number };
  assert.equal((await checkHealth(`tcp://127.0.0.1:${port}`)).ok, true);
  await new Promise((r) => server.close(r));
  assert.equal((await checkHealth(`tcp://127.0.0.1:${port}`)).ok, false);
});
