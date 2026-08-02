/**
 * 后端返回的时间戳（如 2026-08-02T11:54:27.349000）不带时区后缀，
 * 浏览器会误当作本地时间解析，导致「多久前」相差一个时区偏移。
 * 统一按 UTC 解析，保证全站时间显示与实际操作时间一致。
 */
export function parseServerDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" && !/(Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    return new Date(`${value.replace(" ", "T")}Z`);
  }
  return new Date(value);
}