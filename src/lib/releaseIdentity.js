// Vite replaces this constant at build time; the identity stays with cached assets.
export const releaseIdentity = Object.freeze(typeof __RELEASE_IDENTITY__ === "undefined"
  ? { deploymentId: "unknown", commitSha: "unknown", builtAt: null }
  : __RELEASE_IDENTITY__);

export function frontendVersionHeaders(identity = releaseIdentity) {
  return {
    "X-Frontend-Deployment-ID": identity.deploymentId,
    "X-Frontend-Commit-SHA": identity.commitSha,
    ...(identity.builtAt ? { "X-Frontend-Built-At": identity.builtAt } : {}),
  };
}
