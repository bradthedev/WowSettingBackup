import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import electronRenderer from 'vite-plugin-electron-renderer';
import path from 'path';

const projectRoot = __dirname;

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: path.resolve(projectRoot, 'src/main/main.ts'),
        vite: {
          build: {
            outDir: path.resolve(projectRoot, 'dist/main'),
            rollupOptions: {
              external: [
                'electron',
                'electron-store',
                'winston',
                'winston-daily-rotate-file',
                'lz4-napi',
                'tar-stream',
                'ws',
                'bonjour-service',
                'googleapis',
                'dropbox',
              ],
            },
          },
        },
      },
      {
        entry: path.resolve(projectRoot, 'src/preload.ts'),
        vite: {
          build: {
            outDir: path.resolve(projectRoot, 'dist'),
          },
        },
        onstart(args) {
          args.reload();
        },
      },
    ]),
    electronRenderer(),
  ],
  resolve: {
    alias: {
      '@renderer': path.resolve(projectRoot, 'src/renderer'),
    },
  },
  root: path.resolve(projectRoot, 'src/renderer'),
  build: {
    outDir: path.resolve(projectRoot, 'dist/renderer'),
    emptyOutDir: true,
  },
});
