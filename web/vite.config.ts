import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

/** Must match Nest `PORT` (default 3000). Set `API_PROXY_TARGET` in `web/.env` if the API listens elsewhere. */
function apiProxyTarget(mode: string): string {
  const env = loadEnv(mode, __dirname, '');
  const raw = (env.API_PROXY_TARGET || 'http://localhost:3000').trim().replace(/\/+$/, '');
  return raw || 'http://localhost:3000';
}

export default defineConfig(({ mode }) => {
  const apiTarget = apiProxyTarget(mode);
  const proxy = {
    '/api': {
      target: apiTarget,
      changeOrigin: true,
    },
    '/uploads': {
      target: apiTarget,
      changeOrigin: true,
    },
  };
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy,
    },
    /** `vite preview` has no `server` proxy unless duplicated here — avoids false 404s when testing production builds. */
    preview: {
      proxy,
    },
  };
});
