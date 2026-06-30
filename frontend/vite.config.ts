import fs from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function readVersionFromPackageJson(): string | null {
  try {
    const raw = fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    const value = typeof parsed.version === 'string' ? parsed.version.trim() : '';
    return value || null;
  } catch {
    return null;
  }
}

const appVersion = readVersionFromPackageJson() ?? '0.0.0-dev';

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Isolate the heavy optional vendors into their own chunks. Combined with the
        // React.lazy boundaries (CodeEditor, ServerSshTerminal, HostStatus), these are
        // fetched on demand and cached independently across deploys instead of bloating
        // the single entry chunk.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@codemirror') || id.includes('@uiw') || id.includes('@lezer')) {
            return 'codemirror';
          }
          if (id.includes('@xterm')) return 'xterm';
          if (id.includes('recharts') || id.includes('/d3-') || id.includes('victory-vendor')) {
            return 'charts';
          }
          if (id.includes('@ovhcloud')) return 'ods';
          if (id.includes('@dnd-kit')) return 'dndkit';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 4173,
    host: true,
  },
});
