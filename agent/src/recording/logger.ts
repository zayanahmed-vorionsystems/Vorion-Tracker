// src/recording/logger.ts
// Thin logging wrapper so every recording-pipeline log line is prefixed
// consistently and easy to grep out of the existing agent-debug.log file.

const PREFIX = '[RECORDING]';

export const recordingLog = {
  info(message: string, extra?: Record<string, unknown>) {
    if (extra) console.log(`${PREFIX} ${message}`, extra);
    else console.log(`${PREFIX} ${message}`);
  },
  warn(message: string, extra?: Record<string, unknown>) {
    if (extra) console.warn(`${PREFIX} ${message}`, extra);
    else console.warn(`${PREFIX} ${message}`);
  },
  error(message: string, error?: unknown) {
    const detail = error instanceof Error ? error.stack || error.message : error;
    if (detail !== undefined) console.error(`${PREFIX} ${message}`, detail);
    else console.error(`${PREFIX} ${message}`);
  },
};

export function logRecordingStarted() {
  recordingLog.info('Recording started');
}

export function logChunkFinalized(startTime: string, endTime: string) {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  recordingLog.info(`Chunk finalized: ${fmt(startTime)}\u2013${fmt(endTime)}`);
}

export function logCompressing() {
  recordingLog.info('Compressing...');
}

export function logUploading() {
  recordingLog.info('Uploading...');
}

export function logUploadSuccessful() {
  recordingLog.info('Upload successful');
}

export function logDeletingLocalChunk() {
  recordingLog.info('Deleting local chunk');
}

export function logNextChunkRecording() {
  recordingLog.info('Next chunk recording...');
}

export function logUploadFailed(error: unknown) {
  recordingLog.error('Upload failed', error);
}

export function logAddedToRetryQueue() {
  recordingLog.info('Added to retry queue');
}

export function logRetryScheduled(delaySec: number) {
  recordingLog.info(`Retry scheduled in ${delaySec}s`);
}