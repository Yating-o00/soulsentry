export const API_MODES = {
  BASE44: "base44",
  STANDALONE: "standalone"
};

export const apiMode = import.meta.env.VITE_API_MODE || API_MODES.BASE44;
export const isStandaloneMode = apiMode === API_MODES.STANDALONE;
export const standaloneApiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";
