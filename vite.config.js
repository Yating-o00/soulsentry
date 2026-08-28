import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'
import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true
      }
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  plugins: [
    react(),
    legacy({
      targets: ["chrome >= 60", "ios >= 10", "android >= 5", "safari >= 10"],
      additionalLegacyPolyfills: ["regenerator-runtime/runtime"]
    })
  ]
});
