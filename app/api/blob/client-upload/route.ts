import { NextRequest, NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { requireAuth } from '@/lib/api';
import { canAccessLiveMonitor, normalizeRole } from '@/lib/roles';

const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
const MAX_RECORDING_BYTES = 100 * 1024 * 1024;
const ALLOWED_WEBM_CONTENT_TYPES = [
  'video/webm',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8',
  'video/webm;codecs=vp8,opus',
];

function parsePayload(raw: string | null) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function getUploadKind(pathname: string, rawPayload: string | null) {
  const payload = parsePayload(rawPayload);
  if (payload?.kind === 'screenshot' || pathname.startsWith('screenshots/')) return 'screenshot';
  if (payload?.kind === 'live-recording' || pathname.startsWith('live-recordings/')) return 'live-recording';
  if (payload?.kind === 'recording' || pathname.startsWith('recordings/')) return 'recording';
  return '';
}

function logBlobUploadEvent(event: string, details: Record<string, unknown>) {
  console.info(`[blob-upload] ${event}`, details);
}

export async function POST(request: NextRequest) {
  const user = requireAuth(request);
  if ('status' in user) return user;

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'Server misconfigured: BLOB_READ_WRITE_TOKEN is not set' }, { status: 500 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const kind = getUploadKind(pathname, clientPayload);
        const payload = parsePayload(clientPayload);
        logBlobUploadEvent('token-request', {
          route: '/api/blob/client-upload',
          caller: kind || 'unknown',
          pathname,
          userId: user.sub,
          localId: payload?.localId || null,
          batchId: payload?.batchId || null,
          attempt: payload?.attempt ?? null,
          firstAttempt: payload?.firstAttempt ?? null,
        });

        if (kind === 'screenshot') {
          const expectedPrefix = `screenshots/${user.sub}/`;
          if (!pathname.startsWith(expectedPrefix)) throw new Error('Invalid screenshot upload path');
          return {
            allowedContentTypes: ['image/png', 'image/webp', 'image/jpeg'],
            maximumSizeInBytes: MAX_SCREENSHOT_BYTES,
            addRandomSuffix: false,
            tokenPayload: JSON.stringify({ kind, userId: user.sub }),
          };
        }

        if (kind === 'live-recording') {
          if (!canAccessLiveMonitor(normalizeRole(user.role))) throw new Error('Forbidden');
          const employeeId = String(payload?.employeeId || '').trim();
          if (!employeeId || !pathname.startsWith(`live-recordings/${employeeId}/`)) throw new Error('Invalid live recording upload path');
          return {
            allowedContentTypes: ALLOWED_WEBM_CONTENT_TYPES,
            maximumSizeInBytes: MAX_RECORDING_BYTES,
            addRandomSuffix: false,
            tokenPayload: JSON.stringify({ kind, employeeId, adminId: user.sub }),
          };
        }

        if (kind === 'recording') {
          const expectedPrefix = `recordings/${user.sub}/`;
          if (!pathname.startsWith(expectedPrefix)) throw new Error('Invalid recording upload path');
          return {
            allowedContentTypes: ALLOWED_WEBM_CONTENT_TYPES,
            maximumSizeInBytes: MAX_RECORDING_BYTES,
            addRandomSuffix: false,
            tokenPayload: JSON.stringify({ kind, userId: user.sub }),
          };
        }

        throw new Error('Unsupported upload type');
      },
      onUploadCompleted: async (payload) => {
        logBlobUploadEvent('completed', {
          route: '/api/blob/client-upload',
          pathname: payload?.blob?.pathname,
          url: payload?.blob?.url,
          tokenPayload: payload?.tokenPayload || null,
        });
        // Metadata is saved by the explicit commit routes after the client upload succeeds.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Blob upload authorization failed' }, { status: 400 });
  }
}
