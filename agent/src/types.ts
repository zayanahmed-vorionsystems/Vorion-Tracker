// shared/types.ts
// Types shared between the renderer (chunk capture) and the main process
// (write -> compress -> upload -> retry) parts of the recording pipeline.

export interface SessionCredentials {
  serverUrl: string;
  authToken: string;
  employeeId: string;
}

/** Raw chunk handed from the renderer to the main process over IPC. */
export interface RawChunkPayload {
  sessionId: string;
  chunkIndex: number;
  startTime: string; // ISO timestamp when this chunk started recording
  endTime: string;   // ISO timestamp when this chunk stopped recording
  mimeType: string;  // e.g. 'video/webm;codecs=vp9,opus'
  buffer: ArrayBuffer;
}

/** Persisted on disk alongside each chunk so recovery survives a crash/restart. */
export interface ChunkMetadata {
  sessionId: string;
  chunkIndex: number;
  employeeId: string;
  startTime: string;
  endTime: string;
  duration: number; // seconds
  rawPath: string;
  compressedPath: string | null;
  status: ChunkStatus;
  attempts: number;
  lastError: string | null;
  serverUrl: string;
  authToken: string;
  createdAt: string;
  updatedAt: string;
}

export type ChunkStatus =
  | 'written'      // raw webm on disk, not yet compressed
  | 'compressed'   // mp4 ready, not yet uploaded
  | 'uploading'
  | 'uploaded'     // done, safe to delete local files
  | 'failed';      // exhausted or errored, sitting in retry queue

export interface UploadResult {
  ok: boolean;
  fileUrl?: string;
  error?: string;
}

/** IPC channel names, kept in one place so renderer/preload/main stay in sync. */
export const RECORDING_IPC = {
  CHUNK_READY: 'recording:chunk-ready',
  SET_SESSION: 'recording:set-session',
  START: 'recording:start',
  STOP: 'recording:stop',
  STATUS: 'recording:status',
} as const;