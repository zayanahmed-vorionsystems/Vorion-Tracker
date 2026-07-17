// src/recording/compressor.ts
// Transcodes a raw recorded chunk (webm, VP8/VP9 from the renderer's
// MediaRecorder) into a compressed MP4. Defaults to H.264 for maximum
// compatibility; H.265 is available but kept opt-in/configurable since
// support and licensing vary by platform.
//
// Requires the optional dependency `ffmpeg-static` to be installed:
//   npm install ffmpeg-static
// If it's not installed, or ffmpeg fails for any reason, compression is
// skipped and the caller falls back to uploading the original webm —
// recordings are never dropped just because compression failed.

import { execFile } from 'child_process';
import type { VideoCodec } from './types';
import { recordingLog } from './logger';

function resolveFfmpegPath(): string | null {
  try {
    // Optional dependency — resolved lazily so the rest of the app still
    // works even if it hasn't been installed yet.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ffmpegStatic = require('ffmpeg-static');
    const resolved = typeof ffmpegStatic === 'string' ? ffmpegStatic : ffmpegStatic?.default;
    return resolved || null;
  } catch {
    return null;
  }
}

const CODEC_TO_ENCODER: Record<VideoCodec, string> = {
  h264: 'libx264',
  h265: 'libx265',
};

export interface CompressOptions {
  videoCodec?: VideoCodec;
  /** Constant Rate Factor — lower is higher quality/larger file. 23-30 is a good UI-readability range. */
  crf?: number;
  /** Cap the longest edge so large 4K/5K displays don't produce huge uploads. */
  maxDimension?: number;
}

export async function compressChunkToMp4(
  inputPath: string,
  outputPath: string,
  options: CompressOptions = {},
): Promise<{ compressed: boolean; reason?: string }> {
  const ffmpegPath = resolveFfmpegPath();
  if (!ffmpegPath) {
    return { compressed: false, reason: 'ffmpeg-static not installed' };
  }

  const codec = options.videoCodec ?? 'h264';
  const encoder = CODEC_TO_ENCODER[codec] ?? CODEC_TO_ENCODER.h264;
  const crf = options.crf ?? 28; // good quality vs. size balance for screen recordings
  const maxDimension = options.maxDimension ?? 1920;

  // Scale down only if larger than maxDimension, preserve aspect ratio,
  // keep dimensions even (required by yuv420p). No audio track — screen
  // recordings here are video-only.
  const scaleFilter = `scale='min(${maxDimension},iw)':'-2'`;

  const args = [
    '-y',
    '-i', inputPath,
    '-vf', scaleFilter,
    '-c:v', encoder,
    '-preset', 'veryfast',
    '-crf', String(crf),
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-an',
    outputPath,
  ];

  return new Promise((resolve) => {
    execFile(
      ffmpegPath,
      args,
      { maxBuffer: 1024 * 1024 * 32, timeout: 2 * 60 * 1000 },
      (error, _stdout, stderr) => {
        if (error) {
          recordingLog.error('ffmpeg compression failed', stderr || error);
          resolve({ compressed: false, reason: stderr?.toString().slice(-500) || error.message });
          return;
        }
        resolve({ compressed: true });
      },
    );
  });
}