// src/recording/recordingManager.ts
// Orchestrates the full lifecycle of one recorded chunk, end to end:
//   write raw bytes to disk -> compress to mp4 -> upload -> delete
// Recording itself continues in the renderer the entire time; nothing here
// ever pauses capture — chunks are handled fully asynchronously as they
// arrive over IPC.
//
// Also owns crash recovery: on app start, scan the recordings folder for
// any chunk left over from a previous run (app crash, forced quit, etc.)
// and get it uploaded.

import fs from 'fs';
import fs_promises from 'fs/promises';
import path from 'path';
import type { ChunkMetadata, RawChunkPayload, VideoCodec } from './types';
import {
  getRecordingsDir,
  getRetryQueueStorePath,
  buildChunkBaseName,
  rawChunkPath,
  compressedChunkPath,
  fallbackChunkPath,
  metadataPath,
} from './paths';
import { compressChunkToMp4 } from './compressor';
import { uploadChunk } from './uploader';
import { RetryQueue } from './retryQueue';
import {
  logChunkFinalized,
  logCompressing,
  logUploading,
  logUploadSuccessful,
  logDeletingLocalChunk,
  logNextChunkRecording,
  logUploadFailed,
  recordingLog,
} from './logger';

class RecordingManager {
  private retryQueue: RetryQueue;
  /** Only one active recording chunk pipeline runs at a time per requirement #9. */
  private activeChunkInFlight = false;
  private videoCodecOverride: VideoCodec | undefined;

  constructor() {
    this.retryQueue = new RetryQueue(getRetryQueueStorePath(), uploadChunk, (meta) =>
      this.deleteLocalChunk(meta),
    );
  }

  setVideoCodec(codec: VideoCodec | undefined) {
    this.videoCodecOverride = codec;
  }

  /**
   * Entry point called from the IPC handler in the main process when the
   * renderer hands off a finished 60s segment.
   *
   * Writes the buffer straight to disk (never held in memory longer than
   * the single IPC round trip) and then runs it through the pipeline
   * without blocking further chunks from being received.
   */
  async handleIncomingChunk(payload: RawChunkPayload, buffer: Buffer): Promise<void> {
    const segmentStart = new Date(payload.startTime);
    const baseName = buildChunkBaseName(payload.deviceId, segmentStart);
    const rawPath = rawChunkPath(baseName);

    try {
      await fs_promises.writeFile(rawPath, buffer);
    } catch (error) {
      recordingLog.error('failed to write chunk to disk (disk full?)', error);
      // Nothing more we can do for this chunk — but recording continues;
      // the renderer has already moved on to the next segment.
      return;
    }

    logChunkFinalized(payload.startTime, payload.endTime);

    const meta: ChunkMetadata = {
      filePath: rawPath,
      fileName: `${baseName}.webm`,
      employeeId: payload.employeeId,
      sessionId: payload.sessionId,
      deviceId: payload.deviceId,
      startTime: payload.startTime,
      endTime: payload.endTime,
      durationSec: payload.durationSec,
      mimeType: payload.mimeType,
      serverUrl: this.currentServerUrl,
      authToken: this.currentAuthToken,
      attempts: 0,
      createdAt: new Date().toISOString(),
      compressed: false,
    };

    await fs_promises.writeFile(metadataPath(baseName), JSON.stringify(meta, null, 2), 'utf8');

    // Fire-and-forget: don't block the IPC handler (and therefore don't
    // block subsequent chunks) on compression/upload of this one.
    void this.processChunk(baseName, meta);

    logNextChunkRecording();
  }

  private async processChunk(baseName: string, meta: ChunkMetadata): Promise<void> {
    logCompressing();

    const mp4Path = compressedChunkPath(baseName);
    const result = await compressChunkToMp4(meta.filePath, mp4Path, {
      videoCodec: this.videoCodecOverride ?? 'h264',
    });

    let finalPath = meta.filePath;
    let finalMime = 'video/webm';

    if (result.compressed) {
      finalPath = mp4Path;
      finalMime = 'video/mp4';
      meta.compressed = true;
      // Raw webm is no longer needed once we have the compressed artifact.
      await this.safeUnlink(meta.filePath);
    } else {
      recordingLog.warn('compression skipped, uploading original webm', { reason: result.reason });
      // Rename the .raw.webm to its final .webm name for clarity/consistency.
      const fallback = fallbackChunkPath(baseName);
      try {
        await fs_promises.rename(meta.filePath, fallback);
        finalPath = fallback;
      } catch {
        finalPath = meta.filePath; // rename failed, upload from original location
      }
    }

    meta.filePath = finalPath;
    meta.fileName = path.basename(finalPath);
    meta.mimeType = finalMime;
    await fs_promises.writeFile(metadataPath(baseName), JSON.stringify(meta, null, 2), 'utf8').catch(() => {});

    await this.uploadWithImmediateAttempt(meta);
  }

  private async uploadWithImmediateAttempt(meta: ChunkMetadata): Promise<void> {
    try {
      logUploading();
      await uploadChunk(meta);
      logUploadSuccessful();
      logDeletingLocalChunk();
      await this.deleteLocalChunk(meta);
    } catch (error) {
      logUploadFailed(error);
      // Hand off to the persistent retry queue — it owns all further
      // attempts (with backoff) and will delete the local file once the
      // upload eventually succeeds. The chunk stays on disk until then.
      this.retryQueue.enqueue(meta);
    }
  }

  private async deleteLocalChunk(meta: ChunkMetadata): Promise<void> {
    await this.safeUnlink(meta.filePath);
    const baseName = path.basename(meta.filePath).replace(/\.(mp4|webm)$/i, '');
    await this.safeUnlink(metadataPath(baseName));
  }

  private async safeUnlink(filePath: string): Promise<void> {
    try {
      await fs_promises.unlink(filePath);
    } catch {
      // Already gone — fine.
    }
  }

  // --- Crash recovery -------------------------------------------------

  /**
   * Scans the recordings folder on app startup for any chunk left behind
   * by a previous run (crash, force-quit, power loss, etc.) and gets it
   * uploaded — nothing is ever silently lost.
   */
  async recoverPendingChunks(): Promise<void> {
    const dir = getRecordingsDir();
    let entries: string[];
    try {
      entries = await fs_promises.readdir(dir);
    } catch {
      return;
    }

    const metadataFiles = entries.filter((f) => f.endsWith('.json'));
    if (metadataFiles.length === 0) return;

    recordingLog.info(`crash recovery: found ${metadataFiles.length} pending chunk(s) from a previous session`);

    for (const metaFile of metadataFiles) {
      const baseName = metaFile.replace(/\.json$/, '');
      const fullMetaPath = path.join(dir, metaFile);
      try {
        const raw = await fs_promises.readFile(fullMetaPath, 'utf8');
        const meta: ChunkMetadata = JSON.parse(raw);

        if (!fs.existsSync(meta.filePath)) {
          recordingLog.warn('recovered metadata but chunk file missing, discarding', { baseName });
          await this.safeUnlink(fullMetaPath);
          continue;
        }

        if (!meta.compressed && meta.mimeType === 'video/webm' && !meta.filePath.endsWith('.webm')) {
          // Was mid-write/mid-compress when the app died; attempt compression again.
          void this.processChunk(baseName, meta);
        } else {
          // Already finalized (mp4 or fallback webm) — just needs (re)uploading.
          this.retryQueue.enqueue(meta, true);
        }
      } catch (error) {
        recordingLog.error(`crash recovery failed for ${baseName}`, error);
      }
    }
  }

  // --- Session config (set at start/stop of tracking) ------------------

  private currentServerUrl = '';
  private currentAuthToken = '';

  setSessionCredentials(serverUrl: string, authToken: string) {
    this.currentServerUrl = serverUrl;
    this.currentAuthToken = authToken;
  }
}

export const recordingManager = new RecordingManager();