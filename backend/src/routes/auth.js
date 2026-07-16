import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signAccessToken } from "../lib/jwt.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { requireAuth } from "../middleware/auth.js";
import { sendVerificationSms } from "../lib/sms.js";

export const authRouter = Router();

const emailLoginSchema = z.object({
  type: z.literal("email"),
  email: z.string().email(),
  password: z.string().min(1)
});

const phoneLoginSchema = z.object({
  type: z.literal("phone"),
  phone: z.string().regex(/^1[3-9]\d{9}$/, "手机号格式不正确"),
  code: z.string().regex(/^\d{6}$/, "验证码应为6位数字")
});

const loginSchema = z.discriminatedUnion("type", [
  emailLoginSchema,
  phoneLoginSchema
]);

const registerSchema = z.object({
  type: z.enum(["email", "phone"]),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  displayName: z.string().min(1).max(50).optional(),
  phone: z.string().regex(/^1[3-9]\d{9}$/).optional(),
  code: z.string().regex(/^\d{6}$/).optional()
}).refine((data) => {
  if (data.type === "email") {
    return !!data.email && !!data.password;
  }
  if (data.type === "phone") {
    return !!data.phone && !!data.code;
  }
  return false;
}, {
  message: "请提供完整的注册信息",
  path: ["type"]
});

const sendSmsSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, "手机号格式不正确"),
  purpose: z.enum(["login", "register", "reset_password", "bind"]).default("login")
});

function serializeUser(user) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    display_name: user.displayName,
    role: user.role.toLowerCase(),
    subscription_plan: user.subscriptionPlan,
    ai_credits: user.aiCredits,
    theme_preferences: user.themePreferences,
    created_date: user.createdAt,
    updated_date: user.updatedAt
  };
}

function generateSmsCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function verifySmsCode(phone, code, purpose) {
  const record = await prisma.smsVerification.findFirst({
    where: {
      phone,
      purpose,
      code,
      verifiedAt: null,
      expiresAt: { gt: new Date() }
    },
    orderBy: { createdAt: "desc" }
  });

  if (!record) {
    return { valid: false, reason: "验证码无效或已过期" };
  }

  await prisma.smsVerification.update({
    where: { id: record.id },
    data: { verifiedAt: new Date() }
  });

  return { valid: true, record };
}

authRouter.post("/sms/send", async (req, res) => {
  const payload = sendSmsSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({
      error: "INVALID_INPUT",
      details: payload.error.flatten()
    });
  }

  const { phone, purpose } = payload.data;

  const recentCount = await prisma.smsVerification.count({
    where: {
      phone,
      createdAt: { gt: new Date(Date.now() - 10 * 60 * 1000) }
    }
  });

  if (recentCount >= 3) {
    return res.status(429).json({
      error: "RATE_LIMITED",
      message: "发送过于频繁，请10分钟后再试"
    });
  }

  const code = generateSmsCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.smsVerification.create({
    data: {
      phone,
      code,
      purpose,
      expiresAt
    }
  });

  try {
    await sendVerificationSms(phone, code, purpose);
  } catch (error) {
    console.error("SMS send failed:", error);
    return res.status(500).json({
      error: "SMS_SEND_FAILED",
      message: "短信发送失败，请稍后重试"
    });
  }

  return res.json({
    success: true,
    message: "验证码已发送",
    expiresIn: 600
  });
});

authRouter.post("/login", async (req, res) => {
  const payload = loginSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({
      error: "INVALID_INPUT",
      details: payload.error.flatten()
    });
  }

  if (payload.data.type === "email") {
    const { email, password } = payload.data;

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user || !user.passwordHash) {
      return res.status(401).json({
        error: "INVALID_CREDENTIALS",
        message: "账号或密码错误"
      });
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({
        error: "INVALID_CREDENTIALS",
        message: "账号或密码错误"
      });
    }

    const token = signAccessToken(user);
    return res.json({ token, user: serializeUser(user) });
  }

  if (payload.data.type === "phone") {
    const { phone, code } = payload.data;

    const verification = await verifySmsCode(phone, code, "login");
    if (!verification.valid) {
      return res.status(401).json({
        error: "INVALID_CODE",
        message: verification.reason
      });
    }

    let user = await prisma.user.findUnique({
      where: { phone }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          phone,
          displayName: `用户${phone.slice(-4)}`,
          preferences: {
            create: {
              locale: "zh-CN",
              timezone: "Asia/Shanghai"
            }
          },
          creditTxs: {
            create: {
              type: "GIFT",
              amount: 200,
              balanceAfter: 200,
              description: "新用户赠送 200 AI 点数"
            }
          }
        }
      });
    }

    const token = signAccessToken(user);
    return res.json({ token, user: serializeUser(user) });
  }
});

authRouter.post("/register", async (req, res) => {
  const payload = registerSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({
      error: "INVALID_INPUT",
      details: payload.error.flatten()
    });
  }

  const data = payload.data;

  if (data.type === "email") {
    const existing = await prisma.user.findUnique({
      where: { email: data.email }
    });

    if (existing) {
      return res.status(409).json({
        error: "EMAIL_EXISTS",
        message: "邮箱已注册"
      });
    }

    const passwordHash = await hashPassword(data.password);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        displayName: data.displayName,
        preferences: {
          create: {
            locale: "zh-CN",
            timezone: "Asia/Shanghai"
          }
        },
        creditTxs: {
          create: {
            type: "GIFT",
            amount: 200,
            balanceAfter: 200,
            description: "新用户赠送 200 AI 点数"
          }
        }
      }
    });

    const token = signAccessToken(user);
    return res.status(201).json({ token, user: serializeUser(user) });
  }

  if (data.type === "phone") {
    const verification = await verifySmsCode(data.phone, data.code, "register");
    if (!verification.valid) {
      return res.status(401).json({
        error: "INVALID_CODE",
        message: verification.reason
      });
    }

    const existing = await prisma.user.findUnique({
      where: { phone: data.phone }
    });

    if (existing) {
      return res.status(409).json({
        error: "PHONE_EXISTS",
        message: "手机号已注册"
      });
    }

    const user = await prisma.user.create({
      data: {
        phone: data.phone,
        displayName: data.displayName || `用户${data.phone.slice(-4)}`,
        preferences: {
          create: {
            locale: "zh-CN",
            timezone: "Asia/Shanghai"
          }
        },
        creditTxs: {
          create: {
            type: "GIFT",
            amount: 200,
            balanceAfter: 200,
            description: "新用户赠送 200 AI 点数"
          }
        }
      }
    });

    const token = signAccessToken(user);
    return res.status(201).json({ token, user: serializeUser(user) });
  }
});

authRouter.get("/me", requireAuth, async (req, res) => {
  return res.json({ user: serializeUser(req.user) });
});

authRouter.post("/bind-phone", requireAuth, async (req, res) => {
  const schema = z.object({
    phone: z.string().regex(/^1[3-9]\d{9}$/, "手机号格式不正确"),
    code: z.string().regex(/^\d{6}$/, "验证码应为6位数字")
  });

  const payload = schema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({
      error: "INVALID_INPUT",
      details: payload.error.flatten()
    });
  }

  const { phone, code } = payload.data;

  const verification = await verifySmsCode(phone, code, "bind");
  if (!verification.valid) {
    return res.status(401).json({
      error: "INVALID_CODE",
      message: verification.reason
    });
  }

  const existing = await prisma.user.findUnique({
    where: { phone }
  });

  if (existing && existing.id !== req.user.id) {
    return res.status(409).json({
      error: "PHONE_BOUND",
      message: "该手机号已绑定其他账号"
    });
  }

  await prisma.user.update({
    where: { id: req.user.id },
    data: { phone }
  });

  return res.json({
    success: true,
    message: "手机号绑定成功"
  });
});

authRouter.post("/bind-email", requireAuth, async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(8)
  });

  const payload = schema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({
      error: "INVALID_INPUT",
      details: payload.error.flatten()
    });
  }

  const { email, password } = payload.data;

  const existing = await prisma.user.findUnique({
    where: { email }
  });

  if (existing && existing.id !== req.user.id) {
    return res.status(409).json({
      error: "EMAIL_BOUND",
      message: "该邮箱已绑定其他账号"
    });
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: req.user.id },
    data: { email, passwordHash }
  });

  return res.json({
    success: true,
    message: "邮箱绑定成功"
  });
});
