import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { hasSuspiciousQueryPayload } from '@/lib/request-security';

const isDevelopment = process.env.NODE_ENV !== 'production';

const cspDirectives = [
  "default-src 'self'",
  "base-uri 'self'",
  "child-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  "manifest-src 'self'",
  "font-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline' https:",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  'upgrade-insecure-requests',
].join('; ');

export function middleware(req: NextRequest) {
  if (hasSuspiciousQueryPayload(req.nextUrl)) {
    return NextResponse.json(
      { error: 'Request rejected due to invalid query parameters' },
      { status: 400 }
    );
  }

  const response = NextResponse.next();
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('Origin-Agent-Cluster', '?1');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  if (!isDevelopment) {
    response.headers.set('Content-Security-Policy', cspDirectives);
  }

  return response;
}

export const config = {
  matcher: '/:path*',
};
