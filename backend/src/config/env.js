import "dotenv/config";
import { z } from "zod";

const isDev = process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";

// Prisma Client 在 import 时就会读取 schema 中的 env()，
// 因此必须在 zod 解析之前把默认值写回 process.env。
if (isDev && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:./prisma/dev.db";
}
if (isDev && !process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "dev-jwt-secret-please-change-in-production";
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: isDev ? z.string().min(1).default("file:./prisma/dev.db") : z.string().min(1),
  JWT_SECRET: isDev ? z.string().min(16).default("dev-jwt-secret-please-change-in-production") : z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  UPLOAD_DIR: z.string().default("uploads"),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  WECHAT_APPID: z.string().optional(),
  WECHAT_MCHID: z.string().optional(),
  WECHAT_SERIAL_NO: z.string().optional(),
  WECHAT_API_V3_KEY: z.string().optional(),
  WECHAT_PRIVATE_KEY: z.string().optional(),
  WECHAT_PRIVATE_KEY_PATH: z.string().optional(),
  WECHAT_NOTIFY_URL: z.string().optional(),
  WECHAT_APP_SECRET: z.string().optional(),

  // 微信小程序订阅消息模板 ID（可选，未配置时走应用内提醒）
  WECHAT_SUBSCRIBE_REMINDER_TMPL_ID: z.string().optional(),
  WECHAT_SUBSCRIBE_FOLLOWUP_TMPL_ID: z.string().optional(),

  // 微信小程序订阅消息字段映射（默认使用常见字段名，若模板不一致请修改）
  WECHAT_SUBSCRIBE_REMINDER_TITLE_FIELD: z.string().optional(),
  WECHAT_SUBSCRIBE_REMINDER_DESC_FIELD: z.string().optional(),
  WECHAT_SUBSCRIBE_REMINDER_TIME_FIELD: z.string().optional(),
  WECHAT_SUBSCRIBE_FOLLOWUP_TITLE_FIELD: z.string().optional(),
  WECHAT_SUBSCRIBE_FOLLOWUP_TIME_FIELD: z.string().optional(),
  WECHAT_SUBSCRIBE_FOLLOWUP_NOTE_FIELD: z.string().optional(),

  // Kimi / Moonshot AI（可选，未配置时 callAI 等接口会提示未配置）
  KIMI_API_KEY: z.string().optional(),
  MOONSHOT_API_KEY: z.string().optional(),

  // 阿里云短信（可选，未配置时短信登录/注册走 mock）
  // 兼容多种命名：生产 env 中使用的 SMS_* / ALIYUN_SMS_* / ALIYUN_*
  SMS_PROVIDER: z.string().optional(),
  SMS_ACCESS_KEY_ID: z.string().optional(),
  SMS_ACCESS_KEY_SECRET: z.string().optional(),
  SMS_SIGN_NAME: z.string().optional(),
  SMS_TEMPLATE_CODE: z.string().optional(),
  ALIYUN_SMS_ACCESS_KEY_ID: z.string().optional(),
  ALIYUN_SMS_ACCESS_KEY_SECRET: z.string().optional(),
  ALIYUN_SMS_SIGN_NAME: z.string().optional(),
  ALIYUN_SMS_TEMPLATE_CODE: z.string().optional(),
  ALIYUN_SMS_TEMPLATE_LOGIN: z.string().optional(),
  ALIYUN_SMS_REGION: z.string().optional(),
  ALIYUN_SMS_REGION_ID: z.string().optional(),
  ALIYUN_ACCESS_KEY_ID: z.string().optional(),
  ALIYUN_ACCESS_KEY_SECRET: z.string().optional()
});

export const env = envSchema.parse(process.env);
