import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Trägt nach dem Bauen die Liste aller Dateien in den Service Worker ein,
 * damit die App vollständig offline verfügbar ist.
 */
function serviceWorkerPrecache(): Plugin {
  let outDir = 'dist';
  return {
    name: 'adressbuch-sw-precache',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir)) {
          const full = join(dir, entry);
          if (statSync(full).isDirectory()) walk(full);
          else files.push(relative(outDir, full).split('\\').join('/'));
        }
      };
      walk(outDir);

      const precache = files.filter((file) => file !== 'sw.js' && !file.endsWith('.map'));
      const hash = createHash('sha256');
      for (const file of precache) hash.update(file).update(readFileSync(join(outDir, file)));
      const urls = ['./', ...precache.filter((file) => file !== 'index.html').map((file) => './' + file)];

      const swPath = join(outDir, 'sw.js');
      const source = readFileSync(swPath, 'utf8')
        .replace('__SW_VERSION__', hash.digest('hex').slice(0, 12))
        .replace('self.__PRECACHE__ || []', JSON.stringify(urls));
      writeFileSync(swPath, source);
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    wasm(),
    serviceWorkerPrecache(),
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
