import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'
import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const releaseIdentity = process.env.SOULSENTRY_RELEASE_IDENTITY_JSON
  ? JSON.parse(process.env.SOULSENTRY_RELEASE_IDENTITY_JSON)
  : { deploymentId: 'unknown', commitSha: 'unknown', builtAt: null };

// https://vite.dev/config/
export default defineConfig({
  define: { __RELEASE_IDENTITY__: JSON.stringify(releaseIdentity) },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true
      },
      // 上传后的图片由后端 /uploads 静态目录提供；本地开发也需要代理，
      // 否则 <img src="/uploads/..."> 会落到 SPA 的 index.html，图片显示成裂图
      "/uploads": {
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
    { name: 'release-identity', generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'release-identity.json', source: JSON.stringify(releaseIdentity) });
    } },
    react(),
    legacy({
      targets: ["chrome >= 60", "ios >= 10", "android >= 5", "safari >= 10"],
      additionalLegacyPolyfills: ["regenerator-runtime/runtime"]
    })
  ],
  build: {
    rollupOptions: {
      output: {
        // 大包在网络中间层（公司代理/VPN）里容易卡住单文件下载；
        // 把公共依赖拆成多个较小的 chunk，首屏可以并行拿到，且避免单个 JS 超过中间层阈值。
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          // 只拆核心公共依赖；其余交给 Vite 自动分包，避免把懒加载页面的大依赖
          // 强行聚成一个大 vendor 包，也避免 vendor 之间的循环依赖。
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/") || id.includes("node_modules/scheduler/")) return "vendor-react";
          if (id.includes("node_modules/react-router") || id.includes("node_modules/@remix-run")) return "vendor-router";
          if (id.includes("node_modules/@tanstack")) return "vendor-query";
          if (id.includes("node_modules/@radix-ui")) return "vendor-radix";
          if (id.includes("node_modules/lucide-react")) return "vendor-icons";
          if (id.includes("node_modules/framer-motion")) return "vendor-motion";
          return undefined;
        }
      }
    }
  }
});
