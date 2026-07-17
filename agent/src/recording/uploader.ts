// src/recording/uploader.ts
// Uploads one finished chunk to the existing, unmodified upload API
// (app/api/live-recordings/route.ts). Uses Node's built-in fetch/FormData/File
// (available globally in modern Electron main processes), matching the
// pattern already used elsewhere in this codebase (e.g. uploadScreenshotFile
// in main.ts) rather than introducing a new HTTP client.

import fs from 'fs/promises';
import path from 'path';
import type { ChunkMetadata } from './types';

export class UploadError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'UploadError';
    this.status = status;
  }
}

export async function uploadChunk(meta: ChunkMetadata): Promise<void> {
  const buffer = await fs.readFile(meta.filePath);
  const fileName = path.basename(meta.filePath);

  const form = new FormData();
  const file = new File([new Uint8Array(buffer)], fileName, { type: meta.mimeType });
  form.append('file', file);
  form.append('employeeId', meta.employeeId);
  form.append('startTime', meta.startTime);
  form.append('endTime', meta.endTime);
  form.append('duration', String(meta.durationSec));

  const url = new URL('/api/live-recordings', meta.serverUrl).toString();

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${meta.authToken}` },
      body: form,
    });
  } catch (networkError: any) {
    throw new UploadError(`Network error uploading chunk: ${networkError?.message || networkError}`);
  }

  if (!response.ok) {
    let bodyText = '';
    try {
      bodyText = await response.text();
    } catch {
      // ignore
    }
    throw new UploadError(`Upload failed with status ${response.status}: ${bodyText}`, response.status);
  }
}