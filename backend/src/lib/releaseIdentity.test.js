import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readReleaseIdentity, getReleaseIdentity } from "./releaseIdentity.js";

test("release identity exposes only public immutable build fields", t => {
  const directory = mkdtempSync(path.join(tmpdir(), "release-identity-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "identity.json");
  const identity = { deploymentId: "prod-20261125T120000Z-a1b2c3d", commitSha: "a".repeat(40), builtAt: "2026-11-25T12:00:00Z" };
  writeFileSync(file, JSON.stringify({ ...identity, apiKey: "private", targetRelease: "/private/path" }));
  const actual = readReleaseIdentity(file);
  assert.deepEqual(actual, { ...identity, builtAt: "2026-11-25T12:00:00.000Z" });
  assert.ok(Object.isFrozen(actual));
  assert.equal(JSON.stringify(actual).includes("private"), false);
});

test("unknown and malformed releases stay unknown instead of using process configuration", t => {
  const directory = mkdtempSync(path.join(tmpdir(), "release-identity-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "identity.json");
  const unknown = { deploymentId: "unknown", commitSha: "unknown", builtAt: null };
  assert.deepEqual(readReleaseIdentity(file), unknown);
  for (const content of ["not json", JSON.stringify({ deploymentId: "../../secret", commitSha: "a".repeat(40), builtAt: new Date().toISOString() }), JSON.stringify({ deploymentId: "prod-test", commitSha: "short", builtAt: new Date().toISOString() })]) {
    writeFileSync(file, content);
    assert.deepEqual(readReleaseIdentity(file), unknown);
  }
  assert.strictEqual(getReleaseIdentity(), getReleaseIdentity());
});
