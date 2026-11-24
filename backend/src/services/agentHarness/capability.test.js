import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { defineCapability, invokeCapability } from "./capability.js";

test("a capability parses inputs and uses the authenticated execution context", async () => {
  const capability = defineCapability({
    name: "lookup", effect: "read", description: "Look up an owned record.",
    input: z.object({ id: z.string().trim().min(1) }).strict(),
    authorize: (_args, { actorId }) => actorId === "owner",
    execute: ({ id }, { actorId }) => ({ id, actorId }),
  });

  assert.deepEqual(await invokeCapability(capability, { id: " record " }, { actorId: "owner" }), { id: "record", actorId: "owner" });
  await assert.rejects(invokeCapability(capability, { id: "record" }, { actorId: "other" }), { code: "FORBIDDEN" });
  await assert.rejects(invokeCapability(capability, { id: "record", actorId: "owner" }, { actorId: "other" }), { name: "ZodError" });
});

test("cancelling during authorization stops the capability before execution", async () => {
  const controller = new AbortController();
  const capability = defineCapability({
    name: "update", effect: "write", description: "Update an owned record.",
    input: z.object({ id: z.string() }),
    authorize: async () => {
      controller.abort();
      return true;
    },
    execute: () => assert.fail("a cancelled capability must not write"),
  });
  await assert.rejects(invokeCapability(capability, { id: "record" }, { actorId: "owner", signal: controller.signal }), { name: "AbortError" });
});
