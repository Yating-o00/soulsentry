export function defineCapability({ name, description, effect, input, modelInput, authorize, prepare, execute, verify }) {
  if (typeof name !== "string" || !name.trim() || typeof description !== "string" || !description.trim()
    || !["read", "write"].includes(effect) || typeof input?.parse !== "function" || typeof execute !== "function"
    || [authorize, prepare, verify].some((handler) => handler !== undefined && typeof handler !== "function")) {
    throw new TypeError("Invalid Harness capability registration");
  }
  return Object.freeze({ name, description, effect, input, modelInput, authorize, prepare, execute, verify });
}

export async function invokeCapability(capability, rawArgs, context, { signal = context?.signal, phase = "execute" } = {}) {
  if (!["execute", "prepare", "verify"].includes(phase) || typeof capability[phase] !== "function") {
    throw new TypeError(`Unsupported Harness capability phase: ${phase}`);
  }
  signal?.throwIfAborted();
  const args = capability.input.parse(rawArgs);
  const execution = { ...context, signal };
  if (capability.authorize && await capability.authorize(args, execution) !== true) {
    throw Object.assign(new Error("Capability is not authorized"), { code: "FORBIDDEN" });
  }
  signal?.throwIfAborted();
  return capability[phase](args, execution);
}
