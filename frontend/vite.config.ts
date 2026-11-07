import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // loadEnv reads .env, .env.local, .env.<mode>, .env.<mode>.local
  const env = loadEnv(mode, process.cwd())

  // The proxy target for local FastAPI development.
  // - If VITE_API_BASE_URL is set (e.g. http://localhost:8000), use it.
  // - Otherwise default to http://localhost:8000.
  //
  // The proxy is only active in the Vite dev server; it has no effect on
  // production builds. In production, VITE_API_BASE_URL must be set to the
  // real API origin so the browser can reach it directly.
  //
  // With the proxy active you can leave VITE_API_BASE_URL empty in .env.local
  // and all /api/* requests will be forwarded to the FastAPI server, which
  // avoids CORS configuration on the backend during local development.
  const apiTarget = env.VITE_API_BASE_URL || 'http://localhost:8000'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          // All backend routes already start with /api — no rewrite needed.
        },
      },
    },
  }
})
