// src/recording/types.ts
// Shared types for the continuous chunked screen-recording pipeline.
// This pipeline is fully independent from the LiveKit live-watch pipeline
// (live-watch.ts / capture-renderer.js) — it does not touch or depend on it.

export type VideoCodec = 'h264' | 'h265';

export interface RecordingStartConfig {
  employeeId: string;
  sessionId: string;
  authToken: string;
  serverUrl: string;
  /** Stable per-device identifier, used in chunk filenames. */
  deviceId: string;
  /** desktopCapturer source id for the screen to record. */
  sourceId: string;
  /** Chunk length in seconds. Defaults to 60 if omitted. */
  chunkDurationSec?: number;
  /** Preferred output codec for the compressed chunk. Defaults to 'h264'. */
  videoCodec?: VideoCodec;
}

/** Metadata persisted alongside every chunk on disk (as a `.json` sidecar). */
export interface ChunkMetadata {
  /** Absolute path to the final chunk file (mp4 if compressed, webm if not). */
  filePath: string;
  fileName: string;
  employeeId: string;
  sessionId: string;
  deviceId: string;
  startTime: string; // ISO timestamp, segment start
  endTime: string; // ISO timestamp, segment end
  durationSec: number;
  mimeType: string; // 'video/mp4' | 'video/webm'
  serverUrl: string;
  authToken: string;
  /** Number of upload attempts made so far. */
  attempts: number;
  createdAt: string;
  /** True once ffmpeg compression has completed for this chunk. */
  compressed: boolean;
}

/** Raw segment handed from the renderer to the main process before writing to disk. */
export interface RawChunkPayload {
  employeeId: string;
  sessionId: string;
  deviceId: string;
  startTime: string;
  endTime: string;
  durationSec: number;
  mimeType: string;
}