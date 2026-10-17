import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { env } from "../config/env.js";

export const uploadsRouter = Router();

const uploadRoot = path.resolve(process.cwd(), env.UPLOAD_DIR);
fs.mkdirSync(uploadRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const original = file.originalname || "upload";
    const ext = path.extname(original) || "";
    const base = path.basename(original, ext).replace(/[^a-zA-Z0-9._-]/g, "_") || "file";
    const safeName = `${base}${ext}`;
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

uploadsRouter.use(requireAuth);

uploadsRouter.post("/", (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      console.error("[uploads] multer error", err);
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "FILE_TOO_LARGE", message: "文件大小超过 50MB 限制" });
      }
      if (err.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({ error: "UNEXPECTED_FILE", message: "上传字段名必须是 file" });
      }
      return res.status(500).json({ error: "UPLOAD_FAILED", message: "文件上传处理失败" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "NO_FILE", message: "未收到上传文件" });
    }

    const fileUrl = `/uploads/${req.file.filename}`;

    return res.status(201).json({
      file_url: fileUrl,
      file_name: req.file.originalname,
      file_size: req.file.size,
      file_type: req.file.mimetype
    });
  });
});
