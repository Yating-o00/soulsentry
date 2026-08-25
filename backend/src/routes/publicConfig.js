import { Router } from "express";
import { env } from "../config/env.js";

export const publicConfigRouter = Router();

publicConfigRouter.get("/wechat", (_req, res) => {
  return res.json({
    appid: env.WECHAT_APPID || null,
    subscribe_reminder_tmpl_id: env.WECHAT_SUBSCRIBE_REMINDER_TMPL_ID || null,
    subscribe_followup_tmpl_id: env.WECHAT_SUBSCRIBE_FOLLOWUP_TMPL_ID || null
  });
});
