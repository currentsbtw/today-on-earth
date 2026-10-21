import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built site works under any path (e.g. GitHub Pages project sites).
  base: './',
  server: { port: 5173, host: true },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
  // MapLibre starts its worker as a module worker, so emit it as an ES module.
  worker: { format: 'es' },
});
