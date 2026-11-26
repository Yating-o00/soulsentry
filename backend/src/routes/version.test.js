import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { versionRouter } from "./version.js";
import { getReleaseIdentity } from "../lib/releaseIdentity.js";

test("unauthenticated version route returns noncached public release identity", async t => {
  const app = express();
  app.use("/api/version", versionRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/version`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), getReleaseIdentity());
});
