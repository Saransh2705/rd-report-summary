import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
// In index.js, pdfProcessing.js, pdfGeneration.js
import { GlobalWorkerOptions } from 'pdfjs-dist';

// Simple worker path setting
GlobalWorkerOptions.workerSrc = 'pdf.worker.js';

export async function generateVerifiedPDF(file, totalDeposit, totalDefaultFee, summaryTotal, cashCountingData = null) {
    // if (!cashCountingData) {
    //     console.log("No cash counting data provided, skipping PDF generation.");
    // } else {
    //     console.log(cashCountingData);
    // }

    // Worker setup (not needed in Node, but kept for compatibility)

    const buffer = file instanceof Buffer ? file : await file.arrayBuffer ? await file.arrayBuffer() : Buffer.from(file);

    // Load the PDF (pdf-lib)
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];
    const { width, height } = lastPage.getSize();

    // Get last text item on last page (pdf.js)
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const content = await pdf.getPage(pdf.numPages).then(p => p.getTextContent());
    const items = content.items;

    // Sort to find actual last text item
    items.sort((a, b) => {
        const yA = a.transform?.[5] || 0;
        const yB = b.transform?.[5] || 0;
        const xA = a.transform?.[4] || 0;
        const xB = b.transform?.[4] || 0;
        if (yA !== yB) return yB - yA;
        return xA - xB;
    });

    const lastItem = items[items.length - 1];
    const lastY = lastItem.transform?.[5] || 0;
    const spaceLeft = height - lastY;
    const percent = (spaceLeft / height) * 100;

    // console.log("PDF height:", height);
    // console.log("Last Y:", lastY);
    // console.log("Space Left:", spaceLeft);
    // console.log("Space Left (%):", percent.toFixed(2));

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

    // Save and trigger download (Node/Electron: save to disk or return Buffer)
    const finalPdf = await pdfDoc.save({ useObjectStreams: false });

    // If in Electron renderer, you can use Electron APIs to save file
    // For now, just return the Buffer
    return finalPdf;
}