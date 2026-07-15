import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // 5180/8090 rather than the usual 5173/8080: an unrelated older project on
    // this machine already holds those. Must match PORT / PUBLIC_BASE_URL in
    // backend/.env.
    port: 5180,
    strictPort: true, // fail loudly rather than drifting to another port
    // Proxy keeps the browser on one origin in dev, so uploaded media and API
    // calls work without any CORS involvement.
    proxy: {
      '/api': { target: 'http://localhost:8090', changeOrigin: true },
      '/uploads': { target: 'http://localhost:8090', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
})
