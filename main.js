import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // Add this for production file access
      webSecurity: false
    }
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, 'dist/index.html'));
  }

  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
    win.webContents.openDevTools();
  });

  win.removeMenu();
    win.webContents.on('did-finish-load', () => {
    // Ensure worker path is set in production
    win.webContents.executeJavaScript(`
      if (!window.pdfjsWorkerPath) {
        window.pdfjsWorkerPath = 'pdf.worker.js';
      }
    `);
  });
}

app.setName('RD Report Summary Tool');
app.whenReady().then(createWindow);