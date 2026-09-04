import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const vaultRouter = Router();
vaultRouter.use(requireAuth);

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256");
}

export function encryptValue(plainText, password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(password, salt);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const buf = Buffer.concat([salt, iv, authTag, encrypted]);
  return buf.toString("base64");
}

export function decryptValue(cipherText, password) {
  const buf = Buffer.from(String(cipherText), "base64");
  const salt = buf.subarray(0, SALT_LENGTH);
  const iv = buf.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = buf.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buf.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  const key = deriveKey(password, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

function hashPwd(pwd) {
  return crypto.createHash("sha256").update(String(pwd)).digest("hex");
}

const vaultItemInputSchema = z.object({
  label: z.string().min(1).max(120),
  value: z.string().min(1).max(5000),
  password: z.string().min(4).max(40)
});

vaultRouter.get("/", async (req, res) => {
  const items = await prisma.vaultItem.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" }
  });
  return res.json(
    items.map((it) => ({
      id: it.id,
      label: it.label,
      created_date: it.createdAt,
      updated_date: it.updatedAt
    }))
  );
});

vaultRouter.post("/unlock", async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: "MISSING_PASSWORD" });
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user?.vaultPwdHash) {
    return res.status(400).json({ error: "VAULT_NOT_SET", message: "请先设置保险柜密码" });
  }
  if (user.vaultPwdHash !== hashPwd(password)) {
    return res.status(403).json({ error: "WRONG_PASSWORD" });
  }
  const items = await prisma.vaultItem.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" }
  });
  const decrypted = items.map((it) => {
    try {
      return { id: it.id, label: it.label, value: decryptValue(it.value, password), created_date: it.createdAt };
    } catch {
      return { id: it.id, label: it.label, value: "[解密失败]", created_date: it.createdAt };
    }
  });
  return res.json(decrypted);
});

vaultRouter.post("/setup", async (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 4) {
    return res.status(400).json({ error: "PASSWORD_TOO_SHORT" });
  }
  await prisma.user.update({
    where: { id: req.user.id },
    data: { vaultPwdHash: hashPwd(password) }
  });
  return res.json({ ok: true });
});

vaultRouter.post("/change-password", async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user?.vaultPwdHash || user.vaultPwdHash !== hashPwd(oldPassword)) {
    return res.status(403).json({ error: "WRONG_PASSWORD" });
  }

  const items = await prisma.vaultItem.findMany({ where: { userId: req.user.id } });
  const reEncrypted = [];
  for (const it of items) {
    try {
      const plain = decryptValue(it.value, oldPassword);
      reEncrypted.push({ id: it.id, value: encryptValue(plain, newPassword) });
    } catch {
      // skip items that cannot be decrypted
    }
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: req.user.id }, data: { vaultPwdHash: hashPwd(newPassword) } }),
    ...reEncrypted.map((it) => prisma.vaultItem.update({ where: { id: it.id }, data: { value: it.value } }))
  ]);
  return res.json({ ok: true, reencrypted: reEncrypted.length });
});

vaultRouter.post("/", async (req, res) => {
  const payload = vaultItemInputSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }
  const { label, value, password } = payload.data;

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user?.vaultPwdHash) {
    return res.status(400).json({ error: "VAULT_NOT_SET", message: "请先设置保险柜密码" });
  }
  if (user.vaultPwdHash !== hashPwd(password)) {
    return res.status(403).json({ error: "WRONG_PASSWORD" });
  }

  const item = await prisma.vaultItem.create({
    data: {
      userId: req.user.id,
      label,
      value: encryptValue(value, password)
    }
  });

  return res.status(201).json({ id: item.id, label, created_date: item.createdAt });
});

vaultRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.vaultItem.findFirst({
    where: { id: req.params.id, userId: req.user.id }
  });
  if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
  await prisma.vaultItem.delete({ where: { id: existing.id } });
  return res.status(204).send();
});
