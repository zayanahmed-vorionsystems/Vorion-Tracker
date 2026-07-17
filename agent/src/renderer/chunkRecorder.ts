// renderer/chunkRecorder.ts
//
// Runs inside the same hidden capture-renderer window that already drives
// the LiveKit publish (desktopCapturer -> getUserMedia -> LocalVideoTrack).
// This reuses that same MediaStream for a second, independent MediaRecorder
// so chunked file recording runs in parallel with the live stream without
// affecting it.

const CHUNK_MS = 60_000;
const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

function pickMimeType(): string {
  for (const type of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return 'video/webm';
}

export class ChunkRecorder {
  private recorder: MediaRecorder | null = null;
  private sessionId: string;
  private chunkIndex = 0;
  private chunkStart: string = '';
  private stream: MediaStream;
  private stopped = false;

  constructor(stream: MediaStream, sessionId: string) {
    this.stream = stream;
    this.sessionId = sessionId;
  }

  start() {
    this.stopped = false;
    this.startNextChunk();
  }

  stop() {
    this.stopped = true;
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
    }
  }

  private startNextChunk() {
    if (this.stopped) return;

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(this.stream, { mimeType });
    const parts: Blob[] = [];
    this.chunkStart = new Date().toISOString();
    const chunkIndex = this.chunkIndex;

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) parts.push(e.data);
    };

    recorder.onstop = async () => {
      const endTime = new Date().toISOString();
      const blob = new Blob(parts, { type: mimeType });
      const buffer = await blob.arrayBuffer();

      // window.recordingBridge is exposed via preload (contextBridge).
      window.recordingBridge?.sendChunk({
        sessionId: this.sessionId,
        chunkIndex,
        startTime: this.chunkStart,
        endTime,
        mimeType,
        buffer,
      });

      this.chunkIndex += 1;
      if (!this.stopped) this.startNextChunk();
    };

    recorder.start();
    this.recorder = recorder;

    // Stop this chunk's recorder after CHUNK_MS; onstop fires, uploads it,
    // and starts the next chunk. This is a rolling window, not a single
    // long-lived recorder, so a mid-recording crash only loses the current
    // (in-flight) chunk, not the whole session.
    setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
    }, CHUNK_MS);
  }
}

declare global {
  interface Window {
    recordingBridge?: {
      sendChunk: (payload: {
        sessionId: string;
        chunkIndex: number;
        startTime: string;
        endTime: string;
        mimeType: string;
        buffer: ArrayBuffer;
      }) => void;
      setSession: (creds: { serverUrl: string; authToken: string; employeeId: string }) => void;
    };
  }
}