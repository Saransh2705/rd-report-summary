import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import { ensurePdfWorker } from './workerSetup.js';

ensurePdfWorker();

/**
 * Process the uploaded PDF to extract financial values.
 *
 * These RD reports are typically saved with an owner-only PDF restriction
 * (no password needed to open, editing/printing restricted). pdf.js has its
 * own built-in decryption for that standard security handler and reads the
 * real text straight from the file - unlike pdf-lib, which has no stream
 * decryption at all, so `PDFDocument.load(..., { ignoreEncryption: true })`
 * only skips the "refuse to open" check and leaves the content streams as
 * undecrypted ciphertext. So extraction here goes straight to pdf.js on the
 * original bytes rather than routing through pdf-lib first.
 * @param {File|Blob} file - The uploaded file
 * @returns {Promise<{totalDeposit: number, totalDefaultFee: number, summaryTotal: number}>}
 */
export async function processPDF(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  let textContent = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ') + ' ';
    textContent += pageText;
  }

  // Extract values
  const rdRegex = /(\d{1,3}(?:,\d{3})*\.\d{2})\s*Cr\./g;
  const rdMatches = [...textContent.matchAll(rdRegex)];
  const rdValues = [];
  let totalDeposit = 0;

  rdMatches.forEach((match, index) => {
    if ((index + 1) % 2 === 0) {
      const val = parseFloat(match[1].replace(/,/g, ''));
      rdValues.push(val);
      totalDeposit += val;
    }
  });

  const defaultRegex = /\s(\d+\.\d{2})\s+Y\s+\S+\s+Success/g;
  const defaultMatches = [...textContent.matchAll(defaultRegex)];
  const defaultFees = defaultMatches.map(m => parseFloat(m[1]));
  const totalDefaultFee = defaultFees.reduce((sum, val) => sum + val, 0);

  const lastIndex = textContent.lastIndexOf('Total Deposit Amount');
  const summaryText = lastIndex !== -1 ? textContent.slice(lastIndex) : '';
  const amountRegex = /(\d{1,3}(?:,\d{3})*\.\d{2})/g;
  const summaryMatches = [...summaryText.matchAll(amountRegex)];
  const summaryValues = summaryMatches.map(m => parseFloat(m[1].replace(/,/g, '')));
  const summaryTotal = summaryValues.reduce((a, b) => a + b, 0);

  return { totalDeposit, totalDefaultFee, summaryTotal };
}
