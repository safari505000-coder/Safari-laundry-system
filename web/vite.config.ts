import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Must match Nest `PORT` (default 3000). Use IPv4 loopback to avoid Windows resolving `localhost` to `::1`. */
const API_PROXY_TARGET = 'http://127.0.0.1:3000';

export default defineConfig(() => {
  const proxy = {
    '/api': {
      target: API_PROXY_TARGET,
      changeOrigin: true,
    },
    '/uploads': {
      target: API_PROXY_TARGET,
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
