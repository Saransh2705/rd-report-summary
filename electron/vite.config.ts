import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  root: '.',
  esbuild: {
    target: 'esnext'
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext'
    }
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'index.html'
    }
  },
  plugins: [
    {
      name: 'copy-pdf-worker',
      generateBundle() {
        const workerPath = path.resolve(
          __dirname,
          'node_modules/pdfjs-dist/build/pdf.worker.mjs'
        );

        const legacyWorkerPath = path.resolve(
          __dirname,
          'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'
        );

        // Emit through Rollup's asset pipeline (rather than fs.copyFileSync
        // straight into outDir) since generateBundle runs before Rollup has
        // created/emptied the outDir on disk - a direct copy here races
        // against that and intermittently fails with ENOENT.
        const source = fs.existsSync(workerPath)
          ? fs.readFileSync(workerPath)
          : fs.existsSync(legacyWorkerPath)
            ? fs.readFileSync(legacyWorkerPath)
            : null;

        if (source) {
          this.emitFile({ type: 'asset', fileName: 'pdf.worker.js', source });
        } else {
          this.error('PDF worker not found in either location');
        }
      }
    }
  ]
});