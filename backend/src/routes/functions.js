import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

export const functionsRouter = Router();

const supportedFunctions = [
  "analyzeIntent",
  "executeAutomation",
  "savePushSubscription",
  "getVapidPublicKey",
  "createStripeCheckout",
  "queryWechatOrder"
];

functionsRouter.use(requireAuth);

functionsRouter.post("/:name", async (req, res) => {
  const { name } = req.params;

  if (!supportedFunctions.includes(name)) {
    return res.status(404).json({
      error: "FUNCTION_NOT_FOUND",
      message: `未找到函数 ${name}`
    });
  }

  return res.status(501).json({
    error: "FUNCTION_NOT_IMPLEMENTED",
    message: `独立后端已预留 ${name}，但尚未完成迁移`,
    input: req.body
  });
});
