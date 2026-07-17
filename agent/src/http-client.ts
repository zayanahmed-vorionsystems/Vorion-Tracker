import https from 'https';
import http from 'http';
import type { IncomingMessage } from 'http';

export class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function apiRequest(serverUrl: string, token: string, method: string, path: string, body?: any, isFormData = false): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, serverUrl);
    const mod = url.protocol === 'https:' ? https : http;
    const data = body && !isFormData ? Buffer.from(JSON.stringify(body)) : body;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (body && !isFormData) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = String(data.length);
    }
    if (isFormData && body?.getHeaders) Object.assign(headers, body.getHeaders());

    const req = (mod as any).request(
      { hostname: url.hostname, port: url.port || undefined, path: url.pathname + url.search, method, headers },
      (res: IncomingMessage) => {
        let raw = '';
        res.on('data', (chunk: Buffer) => (raw += chunk));
        res.on('end', () => {
          const status = res.statusCode || 0;
          if (!raw) {
            if (status >= 200 && status < 300) return resolve({});
            return reject(new Error(`Request failed ${status}`));
          }
          try {
            const parsed = JSON.parse(raw);
            if (status >= 200 && status < 300) return resolve(parsed);
            return reject(new HttpError(parsed?.error || `Request failed ${status}`, status));
          } catch {
            if (status >= 200 && status < 300) return resolve(raw);
            return reject(new HttpError(`Request failed ${status}: ${raw}`, status));
          }
        });
      },
    );
    req.setTimeout(15000, () => {
      req.destroy(new Error('Request timed out'));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/**
 * Single source of truth for multipart uploads from the agent. Both
 * screenshots and recording chunks go through this exact function — no
 * separate hand-rolled fetch() call per upload type, so there's only one
 * multipart implementation to get right (and to debug if it breaks).
 *
 * `duplex: 'half'` is required by Node's fetch/undici whenever the request
 * body is a large/streamed payload (which a multi-megabyte FormData File
 * effectively is) — omitting it is a documented cause of malformed or
 * truncated multipart bodies on the receiving end for large uploads, which
 * matches "Failed to parse body as FormData" showing up only once payloads
 * got big enough (screenshots, at ~100KB, apparently squeaked by; a ~15MB
 * video chunk did not).
 */
export async function apiFormRequest(serverUrl: string, token: string, path: string, form: FormData) {
  const url = new URL(path, serverUrl);
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers,
    body: form,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });

  const body = await res.text();
  if (!body) {
    if (res.ok) return {};
    throw new HttpError(`Request failed ${res.status}`, res.status);
  }
  const parsed = JSON.parse(body);
  if (!res.ok) throw new HttpError(parsed?.error || `Request failed ${res.status}`, res.status);
  return parsed;
}