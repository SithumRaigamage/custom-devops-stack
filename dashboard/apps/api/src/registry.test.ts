import assert from "node:assert/strict";
import test from "node:test";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-1234";

const { ServiceInputSchema } = await import("./registry.js");
const { commandInvocation, describeInvocation } = await import("./compose.js");

const base = { name: "App", folder: "app", port: 3000, url: "http://127.0.0.1:3000" };

test("shell metacharacters are rejected unless run in shell is on", () => {
  const cmd = "mystack-up --env dev && echo done";
  assert.equal(ServiceInputSchema.safeParse({ ...base, type: "custom", startCmd: cmd }).success, false);
  assert.equal(ServiceInputSchema.safeParse({ ...base, type: "custom", startCmd: cmd, runInShell: true }).success, true);
});

test("integration fields: jenkins needs user and URL; none needs nothing", () => {
  assert.equal(ServiceInputSchema.safeParse({ ...base, integration: "none" }).success, true);
  assert.equal(ServiceInputSchema.safeParse({ ...base, integration: "ollama" }).success, false);
  assert.equal(
    ServiceInputSchema.safeParse({ ...base, integration: "ollama", integrationUrl: "http://localhost:11434" }).success,
    true,
  );
  assert.equal(
    ServiceInputSchema.safeParse({ ...base, integration: "jenkins", integrationUrl: "http://localhost:8080" }).success,
    false,
  );
  assert.equal(
    ServiceInputSchema.safeParse({
      ...base, integration: "jenkins", integrationUrl: "http://localhost:8080", integrationUser: "me",
    }).success,
    true,
  );
});

test("default execution has no shell; shell mode runs zsh -i -c with the command verbatim", () => {
  assert.deepEqual(commandInvocation("docker compose up -d", false), {
    file: "docker", args: ["compose", "up", "-d"], mode: "exec",
  });
  const shell = commandInvocation("myalias --flag 'a b' | tee out", true);
  assert.deepEqual(shell, {
    file: "/bin/zsh", args: ["-i", "-c", "myalias --flag 'a b' | tee out"], mode: "shell",
  });
  assert.match(describeInvocation("myalias", true), /^\/bin\/zsh -i -c "myalias"$/);
  assert.equal(describeInvocation("docker ps", false), "docker ps");
  assert.throws(() => commandInvocation("   ", true));
});
