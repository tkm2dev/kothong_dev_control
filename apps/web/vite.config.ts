import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  server: {
    port: 5173,
    // The API is same-origin in production behind the reverse proxy; the proxy
    // here keeps development identical so the session cookie behaves the same.
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') } },
  },
  build: { outDir: 'dist', sourcemap: true },
});
