// src/recording/paths.ts
import { app } from 'electron';
import fs from 'fs';
import path from 'path';

/**
 * All chunk artifacts (raw + compressed) and their metadata sidecars live here.
 * Using userData keeps this out of the way of the app bundle and survives
 * updates. Nothing here is ever synced/backed up automatically by the OS
 * in a way that would double-upload — it's plain local scratch space.
 */
export function getRecordingsDir(): string {
  const dir = path.join(app.getPath('userData'), 'recordings', 'pending');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getRetryQueueStorePath(): string {
  const dir = path.join(app.getPath('userData'), 'recordings');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'retry-queue.json');
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Builds the canonical chunk base name (without extension), e.g.
 *   device123_2026-07-16_12-00
 * from a segment start Date. Matches the naming convention requested:
 *   ${deviceId}_${date}_${HH-MM}
 */
export function buildChunkBaseName(deviceId: string, segmentStart: Date): string {
  const y = segmentStart.getFullYear();
  const m = pad(segmentStart.getMonth() + 1);
  const d = pad(segmentStart.getDate());
  const hh = pad(segmentStart.getHours());
  const mm = pad(segmentStart.getMinutes());
  const safeDeviceId = String(deviceId || 'device').replace(/[^a-zA-Z0-9_-]/g, '');
  return `${safeDeviceId}_${y}-${m}-${d}_${hh}-${mm}`;
}

export function rawChunkPath(baseName: string): string {
  return path.join(getRecordingsDir(), `${baseName}.raw.webm`);
}

export function compressedChunkPath(baseName: string): string {
  return path.join(getRecordingsDir(), `${baseName}.mp4`);
}

export function fallbackChunkPath(baseName: string): string {
  // Used only if ffmpeg compression fails — we still upload something.
  return path.join(getRecordingsDir(), `${baseName}.webm`);
}

export function metadataPath(baseName: string): string {
  return path.join(getRecordingsDir(), `${baseName}.json`);
}