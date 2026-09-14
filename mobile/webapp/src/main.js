import { initCashCounting, getCashCountingData } from './cashCounting.js';
import { processPDF } from './pdfProcessing.js';
import { generateVerifiedPDF } from './pdfGeneration.js';

// True when running inside the React Native WebView shell. False when this
// bundle is opened directly in a regular browser (used for standalone
// testing of the offline PDF pipeline without a device/emulator).
const inNativeShell = !!window.ReactNativeWebView;

function postToNative(payload) {
  if (inNativeShell) {
    window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  }
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

let processedData = {};
let uploadedFile = null;

function showLoading() {
  document.getElementById('loadingSection').style.display = 'block';
  document.getElementById('uploadTrigger').style.display = 'none';
  document.getElementById('resultSection').style.display = 'none';
  document.getElementById('errorSection').style.display = 'none';
}

function showError(message) {
  document.getElementById('loadingSection').style.display = 'none';
  document.getElementById('errorSection').style.display = 'block';
  document.getElementById('errorMessage').textContent = message || 'Failed to process the PDF file.';
}

async function handleIncomingFile(file, name) {
  uploadedFile = file;
  showLoading();

  try {
    const result = await processPDF(file);
    processedData = result;

    document.getElementById('totalDeposit').textContent = `₹${result.totalDeposit.toFixed(2)}`;
    document.getElementById('defaultFee').textContent = `₹${result.totalDefaultFee.toFixed(2)}`;
    document.getElementById('summaryTotal').textContent = `₹${result.summaryTotal.toFixed(2)}`;
    document.getElementById('verifiedDepositDisplay').textContent = `₹${result.totalDeposit.toFixed(2)}`;

    initCashCounting(result.totalDeposit, (isValid) => {
      document.getElementById('generatePdf').disabled = !isValid;
    });

    document.getElementById('loadingSection').style.display = 'none';
    document.getElementById('resultSection').style.display = 'block';
  } catch (error) {
    showError(error.message);
  }
}

// --- Upload trigger ---
document.getElementById('uploadTrigger').addEventListener('click', () => {
  if (inNativeShell) {
    // Ask the native shell to open the device's document picker (no
    // network involved - just the OS file chooser).
    postToNative({ type: 'pickFile' });
  } else {
    document.getElementById('pdfInput').click();
  }
});

// Standalone browser fallback (native <input type=file>)
document.getElementById('pdfInput').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;
  handleIncomingFile(file, file.name);
});

// --- Messages coming from the native shell ---
async function handleNativeMessage(event) {
  let msg;
  try {
    msg = JSON.parse(event.data);
  } catch {
    return;
  }

  if (msg.type === 'fileSelected') {
    const blob = base64ToBlob(msg.base64, 'application/pdf');
    await handleIncomingFile(blob, msg.name);
  } else if (msg.type === 'fileError') {
    showError(msg.message);
  }
}

// react-native-webview delivers messages on `document` on Android and on
// `window` on iOS, so both listeners are wired up.
document.addEventListener('message', handleNativeMessage);
window.addEventListener('message', handleNativeMessage);

// --- Generate PDF button ---
document.getElementById('generatePdf').addEventListener('click', async () => {
  if (!uploadedFile || !processedData) {
    alert('Please process a PDF file first');
    return;
  }

  const btn = document.getElementById('generatePdf');
  const originalLabel = btn.innerHTML;

  try {
    btn.disabled = true;
    btn.innerHTML = '⏳ Generating PDF...';

    const cashData = getCashCountingData();
    const pdfBytes = await generateVerifiedPDF(
      uploadedFile,
      processedData.totalDeposit,
      processedData.totalDefaultFee,
      processedData.summaryTotal,
      cashData
    );

    if (inNativeShell) {
      postToNative({
        type: 'savePdf',
        base64: bytesToBase64(pdfBytes),
        filename: 'verified_report.pdf'
      });
    } else {
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'verified_report.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    alert('PDF generation failed: ' + error.message);
  } finally {
    btn.innerHTML = originalLabel;
    btn.disabled = false;
  }
});

postToNative({ type: 'ready' });
