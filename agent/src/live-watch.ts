import { BrowserWindow, ipcMain, desktopCapturer } from 'electron';
import fs from 'fs';
import path from 'path';
import type { Socket } from 'socket.io-client';

let captureWindow: BrowserWindow | null = null;
let currentAdminId: string | null = null;
let listenersBound = false;
let socketListenersBound = false;
let windowReadyPromise: Promise<void> | null = null;

function getOrCreateCaptureWindow(): { win: BrowserWindow; ready: Promise<void> } {
  if (captureWindow && !captureWindow.isDestroyed() && windowReadyPromise) {
    return { win: captureWindow, ready: windowReadyPromise };
  }

  const candidateHtmlPaths = [
    path.join(__dirname, 'capture.html'),
    path.join(__dirname, '..', 'src', 'capture.html'),
    path.join(process.resourcesPath || __dirname, 'app.asar', 'dist', 'capture.html'),
  ].filter((candidate, index, list) => list.indexOf(candidate) === index);
  const captureHtmlPath = candidateHtmlPaths.find((candidate) => fs.existsSync(candidate)) || candidateHtmlPaths[0];

  console.log('[live-watch] __dirname', __dirname);
  console.log('[live-watch] captureHtmlPath', captureHtmlPath);
  console.log('[live-watch] existsSync', fs.existsSync(captureHtmlPath));

  const preloadPath = path.join(__dirname, 'capture-preload.js');
  console.log('[live-watch] preloadPath', preloadPath);
  console.log('[live-watch] preloadExists', fs.existsSync(preloadPath));

  const win = new BrowserWindow({
    show: false,
    width: 400,
    height: 300,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  captureWindow = win;

  // 🔍 TEMPORARY DEBUG — capture window ki apni DevTools alag window mein kholo
  // taake [CAPTURE] logs dikh sakein. Debugging khatam hone par ye line hata dena.
  win.webContents.openDevTools({ mode: 'detach' });

  win.once('ready-to-show', () => {
    console.log('[live-watch] capture window ready-to-show');
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    if (win.isDestroyed() || win.webContents.isDestroyed()) return;
    if (errorCode === -3) return; // ERR_ABORTED — harmless
    console.warn('[live-watch] capture window failed to load', {
      captureHtmlPath,
      errorCode,
      errorDescription,
      validatedURL,
    });
  });

  win.on('closed', () => {
    if (captureWindow === win) {
      captureWindow = null;
      windowReadyPromise = null;
    }
  });

  const ready = new Promise<void>((resolve) => {
    win.webContents.once('did-finish-load', () => {
      console.log('[live-watch] capture.html loaded successfully');
      resolve();
    });
  });
  windowReadyPromise = ready;

  win.loadFile(captureHtmlPath).catch((err) => {
    if (win.isDestroyed()) {
      console.log('[live-watch] capture window was closed before load completed');
      return;
    }
    console.error('Failed to load capture window', { captureHtmlPath, err });
  });

  return { win, ready };
}

async function sendStartCapture(win: BrowserWindow) {
  console.log('[MAIN] requesting desktop sources');
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1280, height: 720 },
  });
  const primary = sources[0];
  if (!primary) {
    console.error('[MAIN] no desktop sources available');
    return;
  }

  if (win.isDestroyed()) {
    console.warn('[MAIN] capture window destroyed before start-capture could be sent');
    return;
  }

  console.log('[MAIN] desktop capture sources resolved', { sourceId: primary.id, totalSources: sources.length });
  console.log('[MAIN] sending start-capture to hidden capture window', { sourceId: primary.id });
  win.webContents.send('start-capture', { sourceId: primary.id });
}

export function setupLiveWatch(socket: Socket, employeeId: string) {
  if (!socketListenersBound) {
    socketListenersBound = true;

    socket.on('stream-request', async ({ adminId }: { adminId: string }) => {
      console.log('[MAIN] stream-request received', { adminId, employeeId });
      currentAdminId = adminId;

      try {
        const { win, ready } = getOrCreateCaptureWindow();

        const loaded = await Promise.race([
          ready.then(() => true),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 8000)),
        ]);

        if (win.isDestroyed()) {
          console.warn('[MAIN] capture window was destroyed while waiting for load — retrying once');
          const retry = getOrCreateCaptureWindow();
          await Promise.race([retry.ready, new Promise((r) => setTimeout(r, 8000))]);
          await sendStartCapture(retry.win);
          return;
        }

        if (!loaded) {
          console.error('[MAIN] capture window did not load in time');
          return;
        }

        await sendStartCapture(win);
      } catch (error: any) {
        console.error('[MAIN] unable to start screen capture for stream request');
        console.error(error?.stack || error);
      }
    });

    socket.on('stop-stream', () => {
      console.log('[live-watch] stop-stream received');
      currentAdminId = null;
      if (captureWindow && !captureWindow.isDestroyed()) {
        captureWindow.webContents.send('stop-capture');
      }
    });

    socket.on('stream-answer', ({ sdp }: { sdp: any }) => {
      console.log('[MAIN] stream-answer received; forwarding to capture window', { hasSdp: Boolean(sdp) });
      captureWindow?.webContents.send('remote-answer', { sdp });
    });

    socket.on('ice-candidate', ({ candidate, from }: { candidate: any; from: string }) => {
      if (from === 'admin') {
        console.log('[MAIN] ICE candidate received from admin', { hasCandidate: Boolean(candidate) });
        captureWindow?.webContents.send('remote-ice-candidate', { candidate });
      }
    });
  }

  if (!listenersBound) {
    listenersBound = true;

    ipcMain.on('live-watch:offer', (_event, { sdp }) => {
      console.log('[MAIN] live-watch:offer received', {
        employeeId,
        adminId: currentAdminId,
        hasSdp: Boolean(sdp),
      });
      console.log('[MAIN] emitting stream-offer to socket server');
      socket.emit('stream-offer', { employeeId, adminId: currentAdminId, sdp });
    });

    ipcMain.on('live-watch:ice-candidate', (_event, { candidate }) => {
      console.log('[MAIN] live-watch:ice-candidate received', { employeeId, adminId: currentAdminId, hasCandidate: Boolean(candidate) });
      console.log('[MAIN] emitting ice-candidate to socket server');
      socket.emit('ice-candidate', { employeeId, adminId: currentAdminId, candidate, from: 'agent' });
    });
  }
}

export function teardownLiveWatch() {
  currentAdminId = null;
  if (captureWindow && !captureWindow.isDestroyed()) {
    captureWindow.webContents.send('stop-capture');
    captureWindow.close();
  }
  captureWindow = null;
  windowReadyPromise = null;
}