export const API_MODES = {
  BASE44: "base44",
  STANDALONE: "standalone"
};

export const apiMode = import.meta.env.VITE_API_MODE || API_MODES.BASE44;
export const isStandaloneMode = apiMode === API_MODES.STANDALONE;
// 生产构建留空表示使用同域名相对路径；本地开发通过 vite.config.js 的 /api proxy 转发
export const standaloneApiBaseUrl = import.meta.env.VITE_API_BASE_URL || "";
