import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

/** Must match Nest `PORT` (default 3000). Use `127.0.0.1` — not `localhost` — so Windows avoids resolving to IPv6 `::1` while Nest binds IPv4-only (502 from Vite proxy). */
function apiProxyTarget(mode: string): string {
  const env = loadEnv(mode, __dirname, '');
  const raw = (env.API_PROXY_TARGET || 'http://127.0.0.1:3000').trim().replace(/\/+$/, '');
  return raw || 'http://127.0.0.1:3000';
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
