import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import { ensurePdfWorker } from './workerSetup.js';

ensurePdfWorker();

const RENDER_SCALE = 2; // ~144 DPI - crisp enough to read/print, keeps file size reasonable

/**
 * pdf-lib cannot decrypt PDF content streams at all - loading with
 * { ignoreEncryption: true } only skips the "refuse to open" check and
 * leaves the streams as undecrypted ciphertext, so copying pages through
 * pdf-lib alone produces a corrupted/blank document. pdf.js *can* decrypt
 * (that's how it renders the file correctly for viewing), so the only
 * reliable way to hand pdf-lib a genuinely unlocked, correctly-rendered
 * copy is to rasterize every page with pdf.js and rebuild a brand-new PDF
 * from those images.
 * @param {ArrayBuffer} buffer
 * @returns {Promise<{doc: PDFDocument, pages: import('pdf-lib').PDFPage[], lastPageTextItems: any[]}>}
 */
async function renderToUnlockedPdf(buffer) {
    const pdfjsDoc = await pdfjsLib.getDocument({ data: buffer }).promise;
    const outDoc = await PDFDocument.create();
    const pages = [];
    let lastPageTextItems = [];

    for (let i = 1; i <= pdfjsDoc.numPages; i++) {
        const page = await pdfjsDoc.getPage(i);
        const renderViewport = page.getViewport({ scale: RENDER_SCALE });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(renderViewport.width);
        canvas.height = Math.ceil(renderViewport.height);
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;

        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob(b => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))), 'image/png');
        });
        const pngBytes = new Uint8Array(await blob.arrayBuffer());
        const pngImage = await outDoc.embedPng(pngBytes);

        const pointViewport = page.getViewport({ scale: 1 }); // true PDF page size, in points
        const newPage = outDoc.addPage([pointViewport.width, pointViewport.height]);
        newPage.drawImage(pngImage, { x: 0, y: 0, width: pointViewport.width, height: pointViewport.height });
        pages.push(newPage);

        if (i === pdfjsDoc.numPages) {
            lastPageTextItems = (await page.getTextContent()).items;
        }
    }

    return { doc: outDoc, pages, lastPageTextItems };
}

export async function generateVerifiedPDF(file, totalDeposit, totalDefaultFee, summaryTotal, cashCountingData = null) {
    const buffer = await file.arrayBuffer();

    // Once the totals are calculated, the report we hand back is always a
    // fresh, genuinely unlocked copy - see renderToUnlockedPdf() above.
    const { doc: pdfDoc, pages, lastPageTextItems } = await renderToUnlockedPdf(buffer);
    const lastPage = pages[pages.length - 1];
    const { width, height } = lastPage.getSize();

    // Sort to find actual last text item, to decide how much blank space is
    // left to lay the summary stamp out in.
    const items = [...lastPageTextItems];
    items.sort((a, b) => {
        const yA = a.transform?.[5] || 0;
        const yB = b.transform?.[5] || 0;
        const xA = a.transform?.[4] || 0;
        const xB = b.transform?.[4] || 0;
        if (yA !== yB) return yB - yA;
        return xA - xB;
    });

    const lastItem = items[items.length - 1];
    const lastY = lastItem?.transform?.[5] || 0;
    const spaceLeft = height - lastY;
    const percent = (spaceLeft / height) * 100;

    // Font setup
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSize = 14;
    const color = rgb(0, 0, 0);
    const x = 20;
    let y;

    const horizontalLine =
        `Grand Total: ${totalDeposit.toFixed(2)}   D>F: ${totalDefaultFee.toFixed(2)}   Commission: ${Math.round((summaryTotal - totalDefaultFee) * 0.04)}   TDS: ${Math.round((summaryTotal - totalDefaultFee) * 0.04 * 0.025)}`;

    const keyValuePairs = [
        ["Grand Total Amount", totalDeposit.toFixed(2).toString()],
        ["Default Fee", totalDefaultFee.toFixed(2).toString()],
        ["Commission", Math.round((summaryTotal - totalDefaultFee) * 0.04).toString()],
        ["TDS", Math.round((summaryTotal - totalDefaultFee) * 0.04 * 0.025).toString()],
    ];

    if (percent > 4.5) {
        const startY = lastY - 30;
        const cashStartX = x + 380;
        let y = startY;
        let cashY = startY;

        keyValuePairs.forEach(([key, value], idx) => {
            if (idx % 2 === 0) {
                lastPage.drawRectangle({
                    x: x - 5,
                    y: y - 3,
                    width: 350,
                    height: fontSize + 6,
                    color: rgb(237 / 255, 237 / 255, 237 / 255),
                    opacity: 1
                });
            }
            lastPage.drawText(key, { x, y, size: fontSize, font, color });
            lastPage.drawText(value, { x: x + 200, y, size: fontSize, font, color });
            y -= 20;
        });

        // Right column: cash counting table
        lastPage.drawRectangle({
            x: cashStartX - 5,
            y: cashY - 3,
            width: 240,
            height: fontSize + 6,
            color: rgb(0.8, 0.8, 0.8),
            opacity: 1
        });
        lastPage.drawText("Denomination", { x: cashStartX, y: cashY, size: fontSize, font, color });
        lastPage.drawText("Count", { x: cashStartX + 100, y: cashY, size: fontSize, font, color });
        lastPage.drawText("Total", { x: cashStartX + 170, y: cashY, size: fontSize, font, color });

        cashY -= 20;

        const cashRows = cashCountingData.filter(row => row.total > 0);
        let visibleRowIndex = 0;
        cashRows.forEach(row => {
            const label = row.value === 0 ? "Coins" : `${row.value}`;
            const count = row.value === 0 ? "" : row.count.toString();
            const total = row.total.toString();

            if (visibleRowIndex % 2 === 0) {
                lastPage.drawRectangle({
                    x: cashStartX - 5,
                    y: cashY - 3,
                    width: 240,
                    height: fontSize + 6,
                    color: rgb(237 / 255, 237 / 255, 237 / 255),
                    opacity: 1
                });
            }

            lastPage.drawText(label, { x: cashStartX, y: cashY, size: fontSize, font, color });
            lastPage.drawText(count, { x: cashStartX + 100, y: cashY, size: fontSize, font, color });
            lastPage.drawText(total, { x: cashStartX + 170, y: cashY, size: fontSize, font, color });

            cashY -= 20;
            visibleRowIndex++;
        });

        // Grand total row
        lastPage.drawRectangle({
            x: cashStartX - 5,
            y: cashY - 3,
            width: 240,
            height: fontSize + 6,
            color: rgb(200 / 255, 255 / 255, 200 / 255),
            opacity: 1
        });
        lastPage.drawText("Grand Total", { x: cashStartX, y: cashY, size: fontSize, font, color });
        lastPage.drawText(summaryTotal.toFixed(2), { x: cashStartX + 170, y: cashY, size: fontSize, font, color });
    }
    else {
        // Horizontal layout (bottom)
        y = 40;
        lastPage.drawText(horizontalLine, { x, y, size: fontSize, font, color });

        // Cash Counting Table at Bottom Right
        const marginRight = 40;
        const tableWidth = 240;
        const cashStartX = width - marginRight - tableWidth;
        let cashY = y + 50;

        lastPage.drawRectangle({
            x: cashStartX - 5,
            y: cashY - 3,
            width: tableWidth,
            height: fontSize + 6,
            color: rgb(0.8, 0.8, 0.8),
            opacity: 1
        });
        lastPage.drawText("Denomination", { x: cashStartX, y: cashY, size: fontSize, font, color });
        lastPage.drawText("Count", { x: cashStartX + 100, y: cashY, size: fontSize, font, color });
        lastPage.drawText("Total", { x: cashStartX + 170, y: cashY, size: fontSize, font, color });

        cashY -= 20;

        const cashRows = cashCountingData.filter(row => row.total > 0);
        let visibleRowIndex = 0;

        cashRows.forEach(row => {
            const label = row.value === 0 ? "Coins" : `${row.value}`;
            const count = row.value === 0 ? "" : row.count.toString();
            const total = row.total.toString();

            if (visibleRowIndex % 2 === 0) {
                lastPage.drawRectangle({
                    x: cashStartX - 5,
                    y: cashY - 3,
                    width: tableWidth,
                    height: fontSize + 6,
                    color: rgb(237 / 255, 237 / 255, 237 / 255),
                    opacity: 1
                });
            }

            lastPage.drawText(label, { x: cashStartX, y: cashY, size: fontSize, font, color });
            lastPage.drawText(count, { x: cashStartX + 100, y: cashY, size: fontSize, font, color });
            lastPage.drawText(total, { x: cashStartX + 170, y: cashY, size: fontSize, font, color });

            cashY -= 20;
            visibleRowIndex++;
        });

        // Grand total
        lastPage.drawRectangle({
            x: cashStartX - 5,
            y: cashY - 3,
            width: tableWidth,
            height: fontSize + 6,
            color: rgb(200 / 255, 255 / 255, 200 / 255),
            opacity: 1
        });
        lastPage.drawText("Grand Total", { x: cashStartX, y: cashY, size: fontSize, font, color });
        lastPage.drawText(summaryTotal.toFixed(2), { x: cashStartX + 170, y: cashY, size: fontSize, font, color });
    }

    return pdfDoc.save({ useObjectStreams: false });
}
