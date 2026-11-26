import test from "node:test";
import assert from "node:assert/strict";
import { frontendVersionHeaders } from "./releaseIdentity.js";

test("frontend request version remains the compiled identity even across backend releases", () => {
  const cachedBuild = { deploymentId: "prod-previous", commitSha: "a".repeat(40), builtAt: "2026-11-25T12:00:00.000Z", secret: "never-send" };
  assert.deepEqual(frontendVersionHeaders(cachedBuild), {
    "X-Frontend-Deployment-ID": cachedBuild.deploymentId,
    "X-Frontend-Commit-SHA": cachedBuild.commitSha,
    "X-Frontend-Built-At": cachedBuild.builtAt,
  });
});
