import { getWechatAccessToken } from "../lib/wechatAccessToken.js";
import { prisma } from "../lib/prisma.js";

// 微信文本内容安全检测（security.msgSecCheck）
// 小程序审核要求：所有用户可发布内容的场景（约定/子约定、心签、评论）均须接入。
// 命中违规时前端提示「内容包含违规信息，请修改后发布」即可。
// 微信未配置或检测服务异常时放行（fail-open），避免阻塞正常发布。

const CHECK_MAX_CHARS = 2500; // msgSecCheck 文本长度上限

// openid 存在 userPreference.metadata._extraFields.openid（与 reminderSender 一致）
async function getUserOpenid(userId) {
  try {
    const preferences = await prisma.userPreference.findUnique({ where: { userId } });
    const extra = preferences?.metadata?._extraFields;
    return extra && typeof extra === "object" ? extra.openid || null : null;
  } catch (_err) {
    return null;
  }
}

/**
 * 检测用户发布的文本内容。
 * @returns {Promise<{pass: boolean, message?: string}>}
 */
export async function checkTextSecurity(text, userId) {
  const content = String(text || "").trim().slice(0, CHECK_MAX_CHARS);
  if (!content) return { pass: true };

  const { token, error } = await getWechatAccessToken();
  if (!token) {
    console.warn("[contentSecurity] 微信未配置或取 token 失败，放行:", error);
    return { pass: true };
  }

  const openid = userId ? await getUserOpenid(userId) : null;
  // version 2（推荐）需要 openid + scene，返回 pass/review/risky；无 openid 时降级 version 1
  const useV2 = Boolean(openid);
  const body = useV2
    ? { version: 2, openid, scene: 4, content }
    : { content };

  try {
    const res = await fetch(`https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    // v1/v2 通用：errcode 87014 表示内容违规
    if (data.errcode === 87014) {
      return { pass: false, message: "内容包含违规信息，请修改后发布" };
    }
    if (data.errcode) {
      console.warn(`[contentSecurity] msgSecCheck err ${data.errcode}: ${data.errmsg}`);
      return { pass: true };
    }
    if (useV2 && data?.result?.suggest === "risky") {
      return { pass: false, message: "内容包含违规信息，请修改后发布" };
    }
    if (useV2 && data?.result?.suggest === "review") {
      console.log("[contentSecurity] 内容命中人工复审，放行:", content.slice(0, 30));
    }
    return { pass: true };
  } catch (err) {
    console.warn("[contentSecurity] 调用失败，放行:", err?.message || err);
    return { pass: true };
  }
}

// 路由内联检测：命中违规返回 400 响应，否则返回 null（继续创建流程）
export async function rejectIfRisky(res, text, userId) {
  const sec = await checkTextSecurity(text, userId);
  if (!sec.pass) {
    res.status(400).json({ error: "CONTENT_RISKY", message: sec.message });
    return true;
  }
  return false;
}
