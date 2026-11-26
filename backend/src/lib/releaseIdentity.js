import { readFileSync } from "node:fs";

const identityFile = new URL("../../../release-identity.json", import.meta.url);
const unknown = Object.freeze({ deploymentId: "unknown", commitSha: "unknown", builtAt: null });

// Read only a fixed allowlist; deployment manifests and environment values are private.
export function readReleaseIdentity(file = identityFile) {
  try {
    const value = JSON.parse(readFileSync(file, "utf8"));
    if (typeof value?.deploymentId !== "string"
      || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value.deploymentId)
      || typeof value.commitSha !== "string" || !/^[a-f0-9]{40}$/.test(value.commitSha)
      || typeof value.builtAt !== "string"
      || !/^\d{4}-\d{2}-\d{2}T/.test(value.builtAt)
      || !Number.isFinite(Date.parse(value.builtAt))) return unknown;
    return Object.freeze({
      deploymentId: value.deploymentId,
      commitSha: value.commitSha,
      builtAt: new Date(value.builtAt).toISOString(),
    });
  } catch {
    // Old releases cannot acquire a fabricated identity from another release.
    return unknown;
  }
}

const runningIdentity = readReleaseIdentity();
export const getReleaseIdentity = () => runningIdentity;
