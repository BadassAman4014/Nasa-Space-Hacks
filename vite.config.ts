import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Keep Vite's host check enabled and allow this account's fixed ngrok dev domain.
    allowedHosts: ['guiding-spendable-spinal.ngrok-free.dev'],
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
    watch: {
      ignored: ['**/*.zip', '**/backend/**', '**/ui-ref-import/**'],
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
