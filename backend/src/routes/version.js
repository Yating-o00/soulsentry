import { Router } from "express";
import { getReleaseIdentity } from "../lib/releaseIdentity.js";

export const versionRouter = Router();
versionRouter.get("/", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(getReleaseIdentity());
});
