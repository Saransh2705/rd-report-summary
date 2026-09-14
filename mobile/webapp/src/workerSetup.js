import { GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerSource from 'pdfjs-dist/build/pdf.worker.min.mjs?raw';

let initialized = false;

/**
 * pdf.js needs its worker script to come from a URL. Since this whole app
 * is a single offline HTML file with no other files alongside it, the
 * worker source is inlined at build time (?raw import) and turned into a
 * blob: URL at runtime instead of pointing at a separate pdf.worker.js file.
 * If the worker still fails to start for any reason, pdf.js automatically
 * falls back to running parsing on the main thread, so this stays robust
 * inside a locked-down mobile WebView too.
 */
export function ensurePdfWorker() {
  if (initialized) return;
  const blob = new Blob([pdfWorkerSource], { type: 'text/javascript' });
  GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
  initialized = true;
}
