type StartPayload = {
  sourceId: string;
  employeeId: string;
  sessionId: string;
  authToken: string;
  serverUrl: string;
  chunkSeconds: number;
};

interface RecordingBridge {
  sendChunk(payload: {
    sessionId: string;
    chunkIndex: number;
    startTime: string;
    endTime: string;
    mimeType: string;
    buffer: ArrayBuffer;
  }): void;
  setSession(creds: {
    serverUrl: string;
    authToken: string;
    employeeId: string;
  }): void;
  onStart(callback: (payload: StartPayload) => void): void;
  onStop(callback: () => void): void;
  sendReady(): void;
  log?(payload: Record<string, unknown>): void;
}

declare global {
  interface Window {
    recordingBridge?: RecordingBridge;
  }
}

const globalScope = window as Window & typeof globalThis & {
  __worktrackRecordingRendererInitialized?: boolean;
};

let mediaStream: MediaStream | null = null;
let recorder: MediaRecorder | null = null;
let rotateTimer: ReturnType<typeof setInterval> | null = null;
let chunkStartedAt = '';
let currentBuffer: BlobPart[] = [];
let stopping = false;
let mimeType = '';
let chunkIndex = 0;

function log(payload: Record<string, unknown>) {
  try {
    const bridge = window.recordingBridge as unknown as { log?: (payload: Record<string, unknown>) => void };
    bridge.log?.(payload);
  } catch {
    console.log('[AGENT][RECORDING]', payload);
  }
}

function pickMimeType() {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return '';
}

async function createStream(sourceId: string) {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
        minFrameRate: 10,
        maxFrameRate: 15,
      },
    } as any,
  } as any);
}

function startChunkRecorder(config: StartPayload) {
  if (!mediaStream) return;
  currentBuffer = [];
  chunkStartedAt = new Date().toISOString();

  const instance = new MediaRecorder(mediaStream, {
    mimeType: mimeType || undefined,
    videoBitsPerSecond: 2_000_000,
  });

  instance.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) currentBuffer.push(event.data);
  };
  instance.onstop = () => { void flushChunk(config); };
  instance.onerror = (event) => {
    log({ state: 'recorder-error', message: String((event as any)?.error?.message || event) });
  };

  instance.start();
  recorder = instance;
}

async function flushChunk(config: StartPayload) {
  const endedAt = new Date().toISOString();
  const startedAt = chunkStartedAt;
  const parts = currentBuffer;
  currentBuffer = [];
  if (!parts.length) {
    if (!stopping && mediaStream) startChunkRecorder(config);
    return;
  }

  const blob = new Blob(parts, { type: mimeType || 'video/webm' });
  const buffer = await blob.arrayBuffer();
  const durationSeconds = Math.max(1, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000));

  // sendChunk expects { sessionId, chunkIndex, startTime, endTime, mimeType, buffer }
  const thisChunk = chunkIndex++;
  window.recordingBridge?.sendChunk?.({
    sessionId: config.sessionId,
    chunkIndex: thisChunk,
    startTime: startedAt,
    endTime: endedAt,
    mimeType: mimeType || 'video/webm',
    buffer,
  });

  // Rotation: only start the next chunk's recorder after this one's data
  // has actually been handed off, so we never drop a rotation boundary.
  if (!stopping && mediaStream) startChunkRecorder(config);
}

function rotateChunk() {
  if (!recorder || recorder.state !== 'recording') return;
  recorder.stop();
}

async function startRecordingSession(config: StartPayload) {
  await stopRecordingSession();
  stopping = false;

  mimeType = pickMimeType();
  if (!mimeType) {
    log({ state: 'start-failed', message: 'No supported webm mimeType (vp9/vp8) available' });
    return;
  }

  try {
    mediaStream = await createStream(config.sourceId);
  } catch (error) {
    log({ state: 'start-failed', message: error instanceof Error ? error.message : String(error) });
    return;
  }

  const chunkMs = Math.max(5, config.chunkSeconds || 60) * 1000;
  startChunkRecorder(config);
  rotateTimer = setInterval(rotateChunk, chunkMs);

  mediaStream.getVideoTracks()[0]?.addEventListener('ended', () => {
    log({ state: 'track-ended' });
    void stopRecordingSession();
  });

  log({ state: 'recording-started', mimeType, chunkSeconds: config.chunkSeconds });
}

async function stopRecordingSession() {
  stopping = true;

  if (rotateTimer) { clearInterval(rotateTimer); rotateTimer = null; }

  if (recorder && recorder.state === 'recording') {
    await new Promise<void>((resolve) => {
      recorder!.addEventListener('stop', () => resolve(), { once: true });
      recorder!.stop();
    });
  }
  recorder = null;

  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = null;
}

if (globalScope.__worktrackRecordingRendererInitialized) {
  console.log('[AGENT] recording renderer already initialized');
} else {
  globalScope.__worktrackRecordingRendererInitialized = true;

  if (!window.recordingBridge) {
    console.error('[AGENT][RECORDING] preload bridge missing');
  } else {
    window.recordingBridge.onStart((payload) => void startRecordingSession(payload as StartPayload));
    window.recordingBridge.onStop(() => void stopRecordingSession());
    window.recordingBridge.sendReady();
    log({ state: 'ready' });
  }
}