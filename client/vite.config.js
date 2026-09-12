import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During dev, proxy /api and /uploads to the Express server so cookies are
// same-origin (no CORS friction) and avatar/document URLs resolve.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:5000', changeOrigin: true }
    }
  }
});
