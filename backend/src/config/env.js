import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:ops@example.com"),
  WECHAT_APPID: z.string().optional(),
  WECHAT_MCHID: z.string().optional(),
  WECHAT_SERIAL_NO: z.string().optional(),
  WECHAT_API_V3_KEY: z.string().optional(),
  WECHAT_PRIVATE_KEY: z.string().optional(),
  WECHAT_PRIVATE_KEY_PATH: z.string().optional(),
  WECHAT_NOTIFY_URL: z.string().optional()
});

export const env = envSchema.parse(process.env);
