// 敏感信息检测：与 backend/src/services/heartSignFallback.js 的 VAULT_PATTERNS 保持一致，
// 前端在创建心签前预检，命中则引导用户存入保险柜而非明文入库。
const VAULT_PATTERNS = [
  { re: /\b\d{17}[\dXx]\b/, label: "身份证" },
  { re: /\b\d{15}\b/, label: "证件号" },
  { re: /\b(?:\d{4}[ -]?){3,4}\d{1,4}\b/, label: "银行卡/卡号" },
  { re: /密码[:：]\s*\S+/i, label: "密码" },
  { re: /验证码[:：]\s*\S+/i, label: "验证码" },
  { re: /密钥[:：]\s*\S+/i, label: "密钥" },
  { re: /私钥|token|api\s*key|护照|驾照|驾驶证/i, label: "敏感凭证" }
];

/**
 * 检测文本是否包含敏感信息
 * @returns 命中返回 { pattern, label }，否则返回 null
 */
export function detectSensitive(text) {
  const t = String(text || "");
  for (const p of VAULT_PATTERNS) {
    if (p.re.test(t)) return { pattern: p.re, label: p.label };
  }
  return null;
}
