import { GlobalWorkerOptions } from 'pdfjs-dist';
import { initCashCounting, getCashCountingData } from './cashCounting.js';
import { processPDF } from './pdfProcessing.js';
import { generateVerifiedPDF } from './pdfGeneration.js';

// Simple worker path setting
GlobalWorkerOptions.workerSrc = 'pdf.worker.js';

// File input handling
document.getElementById('pdfInput').addEventListener('change', handleFileSelect);
document.getElementById('uploadTrigger').addEventListener('click', () => {
  document.getElementById('pdfInput').click();
});

// Store processed data for later use
let processedData = {};
let uploadedFile = null;

async function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  uploadedFile = file;

  // Show loading state
  document.getElementById('loadingSection').style.display = 'block';
  document.getElementById('uploadTrigger').style.display = 'none';
  document.getElementById('resultSection').style.display = 'none';
  document.getElementById('errorSection').style.display = 'none';

  try {
    // Process the PDF to extract financial data
    const result = await processPDF(file);
    processedData = result;
    
    // Update UI with extracted values
    document.getElementById('totalDeposit').textContent = `₹${result.totalDeposit.toFixed(2)}`;
    document.getElementById('defaultFee').textContent = `₹${result.totalDefaultFee.toFixed(2)}`;
    document.getElementById('summaryTotal').textContent = `₹${result.summaryTotal.toFixed(2)}`;
    document.getElementById('verifiedDepositDisplay').textContent = `₹${result.totalDeposit.toFixed(2)}`;
    
    // Initialize cash counting
    initCashCounting(result.totalDeposit, (isValid) => {
      document.getElementById('generatePdf').disabled = !isValid;
    });
    
    // Show results
    document.getElementById('loadingSection').style.display = 'none';
    document.getElementById('resultSection').style.display = 'block';
  } catch (error) {
    console.error('Error processing PDF:', error);
    document.getElementById('loadingSection').style.display = 'none';
    document.getElementById('errorSection').style.display = 'block';
    document.getElementById('errorMessage').textContent = error.message || 'Failed to process the PDF file.';
  }
}

// Generate PDF button
document.getElementById('generatePdf').addEventListener('click', async () => {
  if (!uploadedFile || !processedData) {
    alert('Please process a PDF file first');
    return;
  }
  
  try {
    document.getElementById('generatePdf').disabled = true;
    document.getElementById('generatePdf').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating PDF...';
    
    // Get cash counting data
    const cashData = getCashCountingData();
    
    // Generate verified PDF
    const pdfBytes = await generateVerifiedPDF(
      uploadedFile,
      processedData.totalDeposit,
      processedData.totalDefaultFee,
      processedData.summaryTotal,
      cashData
    );
    
    // Create download link
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'verified_report.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
  } catch (error) {
    console.error('PDF generation failed:', error);
    alert('PDF generation failed: ' + error.message);
  } finally {
    document.getElementById('generatePdf').innerHTML = '<i class="fas fa-file-pdf"></i> Download Verified Report';
    document.getElementById('generatePdf').disabled = false;
  }
});