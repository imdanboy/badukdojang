import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [preact()],
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
