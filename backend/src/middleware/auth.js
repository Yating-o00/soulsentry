import { prisma } from "../lib/prisma.js";
import { verifyAccessToken } from "../lib/jwt.js";

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    console.log(`[requireAuth] 401 for ${req.method} ${req.originalUrl || req.path} (auth present=${Boolean(authHeader)})`);
    return res.status(401).json({ error: "UNAUTHORIZED", message: "缺少访问令牌" });
  }

  try {
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { preferences: true }
    });

    if (!user) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "用户不存在" });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ error: "UNAUTHORIZED", message: "访问令牌无效" });
  }
}

// 解析 Authorization 但不强制登录：带有效令牌则 req.user 可用，否则按匿名继续。
// 用于公开分享页——拥有者登录后访问自己的分享链接，需要被识别出来；
// 访客不带令牌或令牌过期都继续走匿名逻辑，绝不返回 401（避免前端 httpClient 清 token）。
export async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (token) {
    try {
      const payload = verifyAccessToken(token);
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (user) req.user = user;
    } catch {
      // 无效令牌按匿名处理
    }
  }
  return next();
}
