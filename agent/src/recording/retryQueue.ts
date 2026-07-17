// src/recording/retryQueue.ts
// A small persistent retry queue for chunk uploads. Persisted to disk as
// JSON so pending items survive an app restart (see recordingManager's
// crash-recovery scan, which re-enqueues anything left in the recordings
// folder on boot). Retries indefinitely with capped exponential backoff —
// per the requirement, we never give up on a recording due to a temporary
// network failure.

import fs from 'fs';
import type { ChunkMetadata } from './types';
import {
  logUploading,
  logUploadSuccessful,
  logDeletingLocalChunk,
  logUploadFailed,
  logAddedToRetryQueue,
  logRetryScheduled,
} from './logger';

interface QueueItem {
  meta: ChunkMetadata;
  attempts: number;
  nextRetryAt: number;
}

const MIN_BACKOFF_SEC = 5;
const MAX_BACKOFF_SEC = 5 * 60; // cap at 5 minutes between retries
const POLL_INTERVAL_MS = 10_000;

export type UploadFn = (meta: ChunkMetadata) => Promise<void>;
export type OnUploaded = (meta: ChunkMetadata) => Promise<void> | void;

export class RetryQueue {
  private items = new Map<string, QueueItem>(); // keyed by filePath
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(
    private readonly storePath: string,
    private readonly uploadFn: UploadFn,
    private readonly onUploaded: OnUploaded,
  ) {
    this.load();
  }

  private load() {
    try {
      const raw = fs.readFileSync(this.storePath, 'utf8');
      const parsed: QueueItem[] = JSON.parse(raw);
      for (const item of parsed) {
        this.items.set(item.meta.filePath, item);
      }
    } catch {
      // No existing queue file yet — that's fine.
    }
  }

  private persist() {
    try {
      fs.writeFileSync(this.storePath, JSON.stringify(Array.from(this.items.values()), null, 2), 'utf8');
    } catch (err) {
      console.error('[RECORDING] failed to persist retry queue', err);
    }
  }

  size(): number {
    return this.items.size;
  }

  enqueue(meta: ChunkMetadata, immediate = false) {
    const existing = this.items.get(meta.filePath);
    this.items.set(meta.filePath, {
      meta,
      attempts: existing?.attempts ?? 0,
      nextRetryAt: immediate ? Date.now() : existing?.nextRetryAt ?? Date.now(),
    });
    logAddedToRetryQueue();
    this.persist();
    this.scheduleProcessing(0);
  }

  private scheduleProcessing(delayMs: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.processQueue();
    }, delayMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  private async processQueue() {
    if (this.processing) return;
    this.processing = true;

    const now = Date.now();
    const due = Array.from(this.items.values()).filter((item) => item.nextRetryAt <= now);

    for (const item of due) {
      try {
        logUploading();
        await this.uploadFn(item.meta);
        this.items.delete(item.meta.filePath);
        this.persist();
        logUploadSuccessful();
        logDeletingLocalChunk();
        await this.onUploaded(item.meta);
      } catch (error) {
        item.attempts += 1;
        const backoffSec = Math.min(MAX_BACKOFF_SEC, MIN_BACKOFF_SEC * Math.pow(2, item.attempts));
        item.nextRetryAt = Date.now() + backoffSec * 1000;
        this.persist();
        logUploadFailed(error);
        logAddedToRetryQueue();
        logRetryScheduled(backoffSec);
      }
    }

    this.processing = false;
    if (this.items.size > 0) {
      this.scheduleProcessing(POLL_INTERVAL_MS);
    }
  }
}