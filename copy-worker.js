import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// __dirname replacement in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const workerSource = path.join(
    __dirname,
    'node_modules',
    'pdfjs-dist',
    'build',
    'pdf.worker.js'
);
const workerDest = path.join(__dirname, 'public', 'pdf.worker.js');

// Create public directory if it doesn't exist
if (!fs.existsSync(path.dirname(workerDest))) {
    fs.mkdirSync(path.dirname(workerDest), { recursive: true });
}

// Copy worker file
if (fs.existsSync(workerSource)) {
    fs.copyFileSync(workerSource, workerDest);
    console.log('✅ Copied PDF worker to public folder');
} else {
    console.error('❌ PDF worker not found at:', workerSource);
}