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
