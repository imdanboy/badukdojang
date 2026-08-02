import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
