import { defineConfig, type Plugin } from 'vite';

/**
 * Build only: names the map's two big downloads in index.html, so main.ts can start both
 * together the moment the snapshot is in (preloadMapFiles). Without it the MapLibre worker
 * starts only after MapLibre has constructed. Not `<link rel="modulepreload">` in the head:
 * on a slow link those share the bandwidth with heat.json and held the first dots back by
 * 0.8 s for no gain in map-ready time (measured 2026-10-23, phone profile). The names are hashed, so this
 * runs once the bundle is written: `<meta name="toe-map-files" content="<map chunk> <worker>">`.
 */
function preloadMap(): Plugin {
  return {
    name: 'toe-preload-map',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const files = Object.values(bundle);
      const mapChunk = files.find(
        (f) => f.type === 'chunk' && f.moduleIds.some((id) => id.replace(/\\/g, '/').endsWith('/src/map.ts')),
      );
      const worker = files.find((f) => /(^|\/)maplibre-gl-worker-[^/]*\.js$/.test(f.fileName));
      const html = bundle['index.html'];
      if (!mapChunk || !worker || !html || html.type !== 'asset') {
        this.error(`preload-map: missing ${!mapChunk ? 'the map chunk' : !worker ? 'the MapLibre worker' : 'index.html'}`);
      }
      const meta = `<meta name="toe-map-files" content="./${mapChunk.fileName} ./${worker.fileName}">`;
      const source = String(html.source);
      if (!source.includes('</head>')) this.error('preload-map: index.html has no </head>');
      html.source = source.replace('</head>', `  ${meta}\n  </head>`);
    },
  };
}

export default defineConfig({
  // Relative base so the built site works under any path (e.g. GitHub Pages project sites).
  base: './',
  server: { port: 5173, host: true },
  plugins: [preloadMap()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
    // Pages: the map, the methodology page and the clip frame (paths relative to web/, where npm runs).
    rollupOptions: {
      input: {
        main: 'index.html',
        about: 'about.html',
        // Render target for the time-lapse renderer; not linked from the site.
        clip: 'clip.html',
      },
    },
  },
  // MapLibre starts its worker as a module worker, so emit it as an ES module.
  worker: { format: 'es' },
});
