import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built site works under any path (e.g. GitHub Pages project sites).
  base: './',
  server: { port: 5173, host: true },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
    // Two pages: the map and the methodology page (paths relative to web/, where npm runs).
    rollupOptions: {
      input: {
        main: 'index.html',
        about: 'about.html',
      },
    },
  },
  // MapLibre starts its worker as a module worker, so emit it as an ES module.
  worker: { format: 'es' },
});
