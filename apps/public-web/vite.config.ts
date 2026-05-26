import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const appRoot = path.dirname(fileURLToPath(import.meta.url));

export default {
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(appRoot, 'src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
  },
};
