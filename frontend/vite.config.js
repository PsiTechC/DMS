import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendURL = env.VITE_BACKEND_URL || 'http://localhost:8090'

  return {
    plugins: [react()],
    server: {
      port: Number(env.VITE_PORT || 5180),
      strictPort: true,
      // Development only. Production should proxy these paths at the web
      // server so the browser and API stay on the same HTTPS origin.
      proxy: {
        '/api': { target: backendURL, changeOrigin: true },
        '/uploads': { target: backendURL, changeOrigin: true },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1200,
    },
  }
})
