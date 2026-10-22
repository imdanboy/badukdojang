import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // @kaya/board-recognition 의 moku(ONNX) 경로는 badukdojang 에서 미사용.
      // dynamic import 해석이 25MB WASM 복사를 유발하므로 stub 로 대체한다.
      'onnxruntime-web': path.resolve('src/lib/onnxruntime-stub.ts'),
    },
  },
  server: {
    proxy: {
      // Proxy KataGo GTP bridge endpoints to the Bun server.
      // Dev-only: production builds serve the SPA statically and must
      // not bake in any backend URL. Configure the production backend
      // URL via runtime env (e.g. a reverse proxy or env-injected
      // public endpoint) instead.
      '/api/gtp': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
