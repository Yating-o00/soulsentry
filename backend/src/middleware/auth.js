import { prisma } from "../lib/prisma.js";
import { verifyAccessToken } from "../lib/jwt.js";

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
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
