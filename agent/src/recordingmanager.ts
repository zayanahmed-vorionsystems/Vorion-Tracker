import { BrowserWindow, ipcMain, desktopCapturer, screen, app } from 'electron';
import fs from 'fs';
import path from 'path';
import { apiFormRequest } from './http-client';
import { getCaptureWindowId } from './live-watch';

type RecordingConfig = {
  employeeId: string;
  sessionId: string;
  authToken: string;
  serverUrl: string;
};

type ChunkMeta = {
  employeeId: string;
  sessionId: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  mimeType: string;
};

type PendingChunk = ChunkMeta & {
  filePath: string;
  attempts: number;
};

const CHUNK_SECONDS = 60;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;
const QUEUE_RETRY_INTERVAL_MS = 60_000;

// NEW: hard cap on total recording duration per session (independent of
// chunking). Once this fires, recording is force-stopped even if the
// renderer hasn't finished its current chunk boundary.
const MAX_TOTAL_RECORDING_SECONDS = 60;

let recordingWindow: BrowserWindow | null = null;
let recordingWindowReady = false;
let recordingReadyPromise: Promise<void> | null = null;
let resolveRecordingReady: (() => void) | null = null;
let listenersBound = false;
let activeConfigKey = '';

// Auth/serverUrl captured whenever recording is (re)started. Queued retries
// and the periodic queue flush reuse whatever was last active, since the
// agent only ever has one authenticated session at a time.
let activeAuthToken = '';
let activeServerUrl = '';

let queueFlushTimer: NodeJS.Timeout | null = null;
let queueFlushInFlight = false;

// NEW: timer enforcing MAX_TOTAL_RECORDING_SECONDS
let hardCapTimer: NodeJS.Timeout | null = null;

function clearHardCapTimer() {
  if (hardCapTimer) {
    clearTimeout(hardCapTimer);
    hardCapTimer = null;
  }
}

function getTempDir() {
  const dir = path.join(app.getPath('userData'), 'recording-tmp');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getQueueFilePath() {
  return path.join(getTempDir(), 'upload-queue.json');
}

function readQueue(): PendingChunk[] {
  try {
    return JSON.parse(fs.readFileSync(getQueueFilePath(), 'utf8'));
  } catch {
    return [];
  }
}

function writeQueue(queue: PendingChunk[]) {
  try {
    fs.writeFileSync(getQueueFilePath(), JSON.stringify(queue, null, 2), 'utf8');
  } catch (error) {
    console.error('[RECORDING] failed to persist upload queue', error);
  }
}

function enqueue(chunk: PendingChunk) {
  const queue = readQueue().filter((item) => item.filePath !== chunk.filePath);
  queue.push(chunk);
  writeQueue(queue);
}

function dequeue(filePath: string) {
  writeQueue(readQueue().filter((item) => item.filePath !== filePath));
}

function updateAttempts(filePath: string, attempts: number) {
  writeQueue(readQueue().map((item) => (item.filePath === filePath ? { ...item, attempts } : item)));
}

function getRecordHtmlPath() {
  const candidates = [
    path.join(__dirname, 'record.html'),
    path.join(__dirname, '..', 'src', 'record.html'),
    path.join(__dirname, '..', 'record.html'),
    path.join(process.resourcesPath || __dirname, 'app.asar', 'dist', 'record.html'),
    path.join(process.resourcesPath || __dirname, 'app.asar', 'src', 'record.html'),
    path.join(process.resourcesPath || __dirname, 'app.asar.unpacked', 'src', 'record.html'),
  ].filter((candidate, index, list) => list.indexOf(candidate) === index);

  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

function bindIpcListeners() {
  if (listenersBound) return;
  listenersBound = true;

  ipcMain.on('recording:ready', (event) => {
    if (!recordingWindow || event.sender.id !== recordingWindow.webContents.id) return;
    recordingWindowReady = true;
    resolveRecordingReady?.();
    resolveRecordingReady = null;
  });

  ipcMain.on('recording:log', (event, payload) => {
    if (!recordingWindow || event.sender.id !== recordingWindow.webContents.id) return;
    console.log('[AGENT][RECORDING]', payload);
  });

  // A finished chunk arrives as raw bytes + metadata. Written to disk
  // immediately so a crash mid-upload never loses the chunk outright.
  //
  // CHANGED: chunks can now arrive from either the standalone recording
  // window (record.html) OR the capture window (capture.html, which runs
  // the LiveKit publisher + the parallel ChunkRecorder off the same
  // MediaStream). Both are trusted, first-party renderer windows created by
  // this app, so both webContents ids are accepted here.
  ipcMain.on('recording:chunk-ready', (event, meta: ChunkMeta, buffer: ArrayBuffer) => {
    const isFromRecordingWindow = Boolean(recordingWindow) && event.sender.id === recordingWindow!.webContents.id;
    const isFromCaptureWindow = event.sender.id === getCaptureWindowId();
    if (!isFromRecordingWindow && !isFromCaptureWindow) return;
    void handleChunkReady(meta, Buffer.from(buffer));
  });

  // NEW: explicit "Record" button handlers. Wire these to the UI's record
  // button via ipcRenderer.invoke('recording:user-start', config) /
  // ipcRenderer.invoke('recording:user-stop') from the main app window
  // (NOT the tracking-start flow). This is what makes recording opt-in
  // instead of auto-starting with ensureLiveWatchRunning().
  ipcMain.handle('recording:user-start', async (_event, config: RecordingConfig) => {
    await startRecording(config);
    return { ok: true };
  });

  ipcMain.handle('recording:user-stop', async () => {
    await stopRecording();
    return { ok: true };
  });
}

async function handleChunkReady(meta: ChunkMeta, buffer: Buffer) {
  const tempDir = getTempDir();
  const fileName = `recording_${Date.parse(meta.startedAt) || Date.now()}.webm`;
  const filePath = path.join(tempDir, fileName);

  try {
    fs.writeFileSync(filePath, buffer);
  } catch (error) {
    console.error('[RECORDING] failed to write chunk to disk, dropping chunk', error);
    return;
  }

  const pending: PendingChunk = { ...meta, filePath, attempts: 0 };
  await uploadWithRetry(pending);
}

async function uploadChunk(chunk: PendingChunk) {
  if (!fs.existsSync(chunk.filePath)) return; // already uploaded/cleaned up
  if (!activeAuthToken || !activeServerUrl) {
    throw new Error('No authenticated session available for recording upload');
  }

  const buffer = fs.readFileSync(chunk.filePath);
  const form = new FormData();
  const file = new File([new Uint8Array(buffer)], path.basename(chunk.filePath), {
    type: chunk.mimeType || 'video/webm',
  });
  form.append('file', file);
  form.append('employeeId', chunk.employeeId);
  form.append('sessionId', chunk.sessionId);
  form.append('startedAt', chunk.startedAt);
  form.append('endedAt', chunk.endedAt);
  form.append('duration', String(chunk.durationSeconds));

  await apiFormRequest(activeServerUrl, activeAuthToken, '/api/upload/recording', form);
}

async function uploadWithRetry(chunk: PendingChunk) {
  enqueue(chunk);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await uploadChunk(chunk);
      dequeue(chunk.filePath);
      try { fs.unlinkSync(chunk.filePath); } catch { /* already gone */ }
      console.log('[RECORDING] chunk uploaded and cleaned up', { filePath: chunk.filePath });
      return;
    } catch (error: any) {
      console.warn(`[RECORDING] upload attempt ${attempt}/${MAX_ATTEMPTS} failed`, error?.message || error);
      updateAttempts(chunk.filePath, attempt);
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  // Never delete the local file on failure — it stays queued on disk and
  // gets picked up by the periodic flush below (e.g. once the network
  // returns), and again on the next app launch since the queue is persisted.
  console.error('[RECORDING] chunk upload failed after max attempts, keeping queued', { filePath: chunk.filePath });
  scheduleQueueFlush();
}

function scheduleQueueFlush() {
  if (queueFlushTimer) return;
  queueFlushTimer = setTimeout(() => {
    queueFlushTimer = null;
    void flushQueue();
  }, QUEUE_RETRY_INTERVAL_MS);
}

async function flushQueue() {
  if (queueFlushInFlight) return;
  if (!activeAuthToken || !activeServerUrl) {
    scheduleQueueFlush();
    return;
  }

  queueFlushInFlight = true;
  try {
    const queue = readQueue();
    for (const chunk of queue) {
      if (!fs.existsSync(chunk.filePath)) {
        dequeue(chunk.filePath);
        continue;
      }
      try {
        await uploadChunk(chunk);
        dequeue(chunk.filePath);
        try { fs.unlinkSync(chunk.filePath); } catch { /* already gone */ }
        console.log('[RECORDING] queued chunk uploaded on retry', { filePath: chunk.filePath });
      } catch (error: any) {
        console.warn('[RECORDING] queued retry failed, will retry again later', error?.message || error);
      }
    }
  } finally {
    queueFlushInFlight = false;
    if (readQueue().length) scheduleQueueFlush();
  }
}

function getOrCreateRecordingWindow() {
  bindIpcListeners();

  if (recordingWindow && !recordingWindow.isDestroyed()) {
    return { win: recordingWindow, ready: recordingReadyPromise || Promise.resolve() };
  }

  const htmlPath = getRecordHtmlPath();
  const preloadPath = path.join(__dirname, 'recording-preload.js');

  const win = new BrowserWindow({
    show: false,
    width: 400,
    height: 300,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  recordingWindow = win;
  recordingWindowReady = false;
  recordingReadyPromise = new Promise<void>((resolve) => {
    resolveRecordingReady = resolve;
  });

  win.on('closed', () => {
    if (recordingWindow === win) {
      recordingWindow = null;
      recordingWindowReady = false;
      recordingReadyPromise = null;
      resolveRecordingReady = null;
      activeConfigKey = '';
    }
  });

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log('[RECORD]', message, { level, line, sourceId });
  });
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return;
    console.error('[RECORDING] recording window failed to load', { errorCode, errorDescription, validatedURL, htmlPath });
  });
  win.webContents.on('will-navigate', (event, targetUrl) => {
    if (targetUrl !== win.webContents.getURL()) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (!htmlPath) {
    throw new Error('record.html not found for recording window');
  }

  win.loadFile(htmlPath).catch((error) => {
    console.error('[RECORDING] failed to load recording window', error);
  });

  return { win, ready: recordingReadyPromise };
}

async function waitForRecordingWindow() {
  if (recordingWindowReady) return;
  try {
    await Promise.race([
      recordingReadyPromise,
      new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('Timed out waiting for recording renderer')), 8000);
      }),
    ]);
  } catch (error) {
    if (recordingWindow && !recordingWindow.isDestroyed()) recordingWindow.destroy();
    recordingWindow = null;
    recordingWindowReady = false;
    recordingReadyPromise = null;
    resolveRecordingReady = null;
    throw error;
  }
}

async function getScreenSourceId() {
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1280, height: 720 } });
  if (!sources.length) throw new Error('No desktop capture sources available');

  let chosen = sources[0];
  try {
    const primaryId = String(screen.getPrimaryDisplay().id);
    const matched = sources.find((source) => {
      const sourceDisplayId = String((source as any).display_id || (source as any).displayId || '');
      return sourceDisplayId === primaryId || source.id.endsWith(primaryId) || /entire/i.test(source.name);
    });
    if (matched) chosen = matched;
  } catch {
    // Fall back to the first available source.
  }

  return chosen.id;
}

export async function startRecording(config: RecordingConfig) {
  if (!config.employeeId || !config.sessionId || !config.authToken) return;

  const nextKey = `${config.employeeId}:${config.sessionId}`;
  activeAuthToken = config.authToken;
  activeServerUrl = config.serverUrl;

  if (activeConfigKey === nextKey && recordingWindow && !recordingWindow.isDestroyed()) {
    void flushQueue();
    return;
  }

  const { win } = getOrCreateRecordingWindow();
  await waitForRecordingWindow();

  const sourceId = await getScreenSourceId();
  activeConfigKey = nextKey;
  win.webContents.send('recording:start', { ...config, sourceId, chunkSeconds: CHUNK_SECONDS });

  // NEW: enforce a hard cap on total recording time. Even though chunks are
  // already cut every CHUNK_SECONDS, nothing previously stopped recording
  // from continuing indefinitely across chunks. This timer force-stops the
  // whole session MAX_TOTAL_RECORDING_SECONDS after it starts.
  clearHardCapTimer();
  hardCapTimer = setTimeout(() => {
    console.log('[RECORDING] max total recording duration reached, auto-stopping', {
      maxSeconds: MAX_TOTAL_RECORDING_SECONDS,
    });
    void stopRecording();
  }, MAX_TOTAL_RECORDING_SECONDS * 1000);

  void flushQueue();
}

export async function stopRecording() {
  activeConfigKey = '';
  clearHardCapTimer();

  if (recordingWindow && !recordingWindow.isDestroyed()) {
    recordingWindow.webContents.send('recording:stop');
    recordingWindow.close();
  }
  recordingWindow = null;
  recordingWindowReady = false;
  recordingReadyPromise = null;
  resolveRecordingReady = null;

  // Give the renderer a beat to flush its in-progress chunk via the
  // 'recording:stop' handler before we consider recording fully torn down.
  void flushQueue();
}