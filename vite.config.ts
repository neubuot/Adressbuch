import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [
    react(),
    wasm(),
  ],
  // Relative Pfade, damit die App auch in einem Unterordner läuft
  base: './',
  server: {
    port: 5173,
    proxy: {
      // Vermittlungsdienst im Entwicklungsbetrieb (npm run signal)
      '/signal': { target: 'ws://localhost:8080', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
  define: {
    'global': 'globalThis',
  },
  resolve: {
    alias: {
      events: 'events',
      util: 'util',
      stream: 'readable-stream',
      'stream/web': 'readable-stream/web',
      buffer: 'buffer',
    }
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis'
      }
    },
    exclude: ['@automerge/automerge']
  }
});
