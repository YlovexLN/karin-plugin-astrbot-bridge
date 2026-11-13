import path from 'node:path'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const webRoot = path.dirname(fileURLToPath(import.meta.url))
const apiTarget = process.env.KARIN_API || 'http://localhost:7777'

// https://vite.dev/config/
export default defineConfig({
  root: webRoot,
  /** 必须与 route.js 的资产前缀、web.config.js 的 page.url 一致 */
  base: '/api/v1/astrbot/assets/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.join(webRoot, 'src')
    }
  },
  server: {
    host: true,
    port: 5176,
    proxy: {
      '/api/v1': {
        target: apiTarget,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: path.join(webRoot, '..', 'web-dist'),
    emptyOutDir: true,
    /**
     * 打成单块：route.js 会给 index.html 里的资源地址补 ?token=，
     * 但 chunk 之间是相对 import，补不上令牌 → 干脆不分块。
     */
    cssCodeSplit: false,
    rollupOptions: {
      output: { inlineDynamicImports: true }
    }
  }
})
