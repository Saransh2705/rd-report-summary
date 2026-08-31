import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'index.html'
    }
  },
  plugins: [
    {
      name: 'copy-pdf-worker',
      buildStart() {
        const workerPath = path.resolve(
          __dirname,
          'node_modules/pdfjs-dist/build/pdf.worker.js'
        );
        
        // Try legacy path if not found
        const legacyWorkerPath = path.resolve(
          __dirname,
          'node_modules/pdfjs-dist/legacy/build/pdf.worker.js'
        );
        
        if (fs.existsSync(workerPath)) {
          this.addWatchFile(workerPath);
        } else if (fs.existsSync(legacyWorkerPath)) {
          this.addWatchFile(legacyWorkerPath);
        }
      },
      generateBundle() {
        const workerPath = path.resolve(
          __dirname,
          'node_modules/pdfjs-dist/build/pdf.worker.js'
        );
        
        const legacyWorkerPath = path.resolve(
          __dirname,
          'node_modules/pdfjs-dist/legacy/build/pdf.worker.js'
        );
        
        const dest = path.resolve(__dirname, 'dist/pdf.worker.js');
        
        if (fs.existsSync(workerPath)) {
          fs.copyFileSync(workerPath, dest);
          console.log('✅ Copied PDF worker to dist');
        } else if (fs.existsSync(legacyWorkerPath)) {
          fs.copyFileSync(legacyWorkerPath, dest);
          console.log('✅ Copied PDF worker (legacy) to dist');
        } else {
          console.error('❌ PDF worker not found in either location');
        }
      }
    }
  ]
});