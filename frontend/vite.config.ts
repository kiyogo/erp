import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

const apiProxyTarget = process.env.KIYO_API_PROXY_URL ?? 'http://127.0.0.1:3001';
const devPort = Number(process.env.KIYO_WEB_PORT ?? 3004);

export default defineConfig({
  plugins: [react()],
  css: {
    postcss: {
      plugins: [
        tailwindcss(),
        autoprefixer(),
      ],
    },
  },
  server: {
    port: devPort,
    strictPort: true,
    host: true,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
