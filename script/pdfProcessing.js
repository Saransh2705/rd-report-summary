import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
// In index.js, pdfProcessing.js, pdfGeneration.js
import { GlobalWorkerOptions } from 'pdfjs-dist';

// Simple worker path setting
GlobalWorkerOptions.workerSrc = 'pdf.worker.js';

/**
 * Re-renders the uploaded PDF into a new unlocked version (in memory)
 * @param {File} file - The uploaded file
 * @returns {Promise<Uint8Array>} - The new, reprinted PDF bytes
 */
async function reprintPDF(file) {
  console.debug('[reprintPDF] Called with file:', file);
  const buffer = await file.arrayBuffer();
  console.debug('[reprintPDF] Got arrayBuffer of length:', buffer.byteLength);
  const originalPdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
  console.debug('[reprintPDF] Loaded original PDF. Page count:', originalPdf.getPageCount());
  const newPdf = await PDFDocument.create();
  const copiedPages = await newPdf.copyPages(originalPdf, originalPdf.getPageIndices());
  console.debug('[reprintPDF] Copied pages:', copiedPages.length);
  copiedPages.forEach((page, idx) => {
    newPdf.addPage(page);
    console.debug(`[reprintPDF] Added page ${idx + 1}`);
  });
  const reprintedBytes = await newPdf.save();
  console.debug('[reprintPDF] Saved new PDF. Byte length:', reprintedBytes.length);
  return reprintedBytes;
}

/**
 * Process the re-rendered PDF to extract financial values
 * @param {File} file - The original uploaded PDF file
 * @returns {Promise<{totalDeposit: number, totalDefaultFee: number, summaryTotal: number}>}
 */
export async function processPDF(file) {
  console.debug('[processPDF] Start processing file:', file);

  // 🔄 First, reprint the PDF to remove restrictions
  const cleanPdfBytes = await reprintPDF(file);
  console.debug('[processPDF] Got clean PDF bytes. Length:', cleanPdfBytes.length);

  // 🔍 Then extract data using pdfjs
  const pdf = await pdfjsLib.getDocument({ data: cleanPdfBytes }).promise;
  console.debug('[processPDF] Loaded PDF with pdfjs. numPages:', pdf.numPages);

  let textContent = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    console.debug(`[processPDF] Processing page ${i}`);
    const content = await page.getTextContent();
    console.debug(`[processPDF] Page ${i} text items:`, content.items.length);
    const pageText = content.items.map(item => item.str).join(' ') + ' ';
    console.debug(`[processPDF] Page ${i} text:`, pageText);
    textContent += pageText;
  }
  console.debug('[processPDF] Full textContent:', textContent);

  // Extract values
  const rdRegex = /(\d{1,3}(?:,\d{3})*\.\d{2})\s*Cr\./g;
  const rdMatches = [...textContent.matchAll(rdRegex)];
  console.debug('[processPDF] rdMatches:', rdMatches.map(m => m[0]));
  const rdValues = [];
  let totalDeposit = 0;

  rdMatches.forEach((match, index) => {
    if ((index + 1) % 2 === 0) {
      const val = parseFloat(match[1].replace(/,/g, ''));
      rdValues.push(val);
      totalDeposit += val;
      console.debug(`[processPDF] rdMatch #${index}: value=${val}, totalDeposit=${totalDeposit}`);
    }
  });
  console.debug('[processPDF] Final rdValues:', rdValues, 'totalDeposit:', totalDeposit);

  const defaultRegex = /\s(\d+\.\d{2})\s+Y\s+\S+\s+Success/g;
  const defaultMatches = [...textContent.matchAll(defaultRegex)];
  console.debug('[processPDF] defaultMatches:', defaultMatches.map(m => m[0]));
  const defaultFees = defaultMatches.map(m => parseFloat(m[1]));
  console.debug('[processPDF] defaultFees:', defaultFees);
  const totalDefaultFee = defaultFees.reduce((sum, val) => sum + val, 0);
  console.debug('[processPDF] totalDefaultFee:', totalDefaultFee);

  const lastIndex = textContent.lastIndexOf("Total Deposit Amount");
  console.debug('[processPDF] lastIndex of "Total Deposit Amount":', lastIndex);
  const summaryText = lastIndex !== -1 ? textContent.slice(lastIndex) : '';
  console.debug('[processPDF] summaryText:', summaryText);
  const amountRegex = /(\d{1,3}(?:,\d{3})*\.\d{2})/g;
  const summaryMatches = [...summaryText.matchAll(amountRegex)];
  console.debug('[processPDF] summaryMatches:', summaryMatches.map(m => m[0]));
  const summaryValues = summaryMatches.map(m => parseFloat(m[1].replace(/,/g, '')));
  console.debug('[processPDF] summaryValues:', summaryValues);
  const summaryTotal = summaryValues.reduce((a, b) => a + b, 0);
  console.debug('[processPDF] summaryTotal:', summaryTotal);

  return { totalDeposit, totalDefaultFee, summaryTotal };
}