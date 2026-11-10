import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

// The module needs a session secret at call time only; set it before import for the DB-free helpers.
process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-1234";
process.env.DATABASE_URL ??= "postgres://stackpilot:stackpilot@127.0.0.1:5432/stackpilot";

const {
  decryptSecret, describeFetchError, encryptSecret, normalizeBaseUrl, statusMessage, testConnection,
} = await import("./integrations.js");

const SECRET = "x".repeat(40);

test("credentials round-trip and are not stored in plain text", () => {
  const encrypted = encryptSecret("jenkins-token-123", SECRET);
  assert.ok(!encrypted.includes("jenkins-token-123"));
  assert.equal(decryptSecret(encrypted, SECRET), "jenkins-token-123");
  assert.notEqual(encryptSecret("jenkins-token-123", SECRET), encrypted, "random IV per encryption");
});

test("credentials cannot be decrypted with a different secret or tampered payload", () => {
  const encrypted = encryptSecret("token", SECRET);
  assert.throws(() => decryptSecret(encrypted, "y".repeat(40)));
  const parts = encrypted.split(":");
  parts[3] = Buffer.from("tampered").toString("base64");
  assert.throws(() => decryptSecret(parts.join(":"), SECRET));
});

test("normalizeBaseUrl uses 127.0.0.1 for localhost and strips trailing slashes", () => {
  assert.equal(normalizeBaseUrl("http://localhost:8080/"), "http://127.0.0.1:8080");
  assert.equal(normalizeBaseUrl("http://localhost:9000/sonar//"), "http://127.0.0.1:9000/sonar");
  assert.equal(normalizeBaseUrl("https://ci.example.com"), "https://ci.example.com");
});

test("fetch errors are described with the real reason", () => {
  assert.match(describeFetchError({ name: "TimeoutError" }, "h:1"), /Timed out after 5s \(h:1\)/);
  assert.match(describeFetchError({ cause: { code: "ECONNREFUSED" } }, "h:1"), /Connection refused \(h:1\)/);
  assert.match(describeFetchError({ cause: { code: "ENOTFOUND" } }), /Host not found/);
  assert.equal(describeFetchError(new Error("boom")), "boom");
  assert.match(statusMessage(401), /Wrong token/);
  assert.match(statusMessage(403), /Forbidden \(403\)/);
});

async function withServer(
  handler: Parameters<typeof createServer>[1],
  run: (baseUrl: string) => Promise<void>,
) {
  const server: Server = createServer(handler);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test("testConnection reports connected, wrong token, and unreachable", async () => {
  await withServer(
    (req, res) => {
      if (req.headers.authorization === "Basic " + Buffer.from("me:good").toString("base64")) {
        res.writeHead(200, { "Content-Type": "application/json" }).end("{}");
      } else {
        res.writeHead(403).end();
      }
    },
    async (baseUrl) => {
      const ok = await testConnection({ serviceId: "j", kind: "jenkins", baseUrl, username: "me", secret: "good" });
      assert.deepEqual([ok.ok, ok.result], [true, "connected"]);

      const bad = await testConnection({ serviceId: "j", kind: "jenkins", baseUrl, username: "me", secret: "bad" });
      assert.deepEqual([bad.ok, bad.result], [false, "wrong_token"]);
      assert.match(bad.message, /403/);
    },
  );

  // Bind then close a server to get a port that is guaranteed to refuse connections.
  const probe = createServer();
  await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
  const closedPort = (probe.address() as AddressInfo).port;
  await new Promise((r) => probe.close(r));
  const dead = await testConnection({ serviceId: "o", kind: "ollama", baseUrl: `http://127.0.0.1:${closedPort}` });
  assert.deepEqual([dead.ok, dead.result], [false, "unreachable"]);
  assert.match(dead.message, /Connection refused/);
});

test("sonarqube validate=false is reported as a wrong token", async () => {
  await withServer(
    (_req, res) => res.writeHead(200, { "Content-Type": "application/json" }).end('{"valid":false}'),
    async (baseUrl) => {
      const result = await testConnection({ serviceId: "s", kind: "sonarqube", baseUrl, secret: "nope" });
      assert.equal(result.result, "wrong_token");
    },
  );
});
