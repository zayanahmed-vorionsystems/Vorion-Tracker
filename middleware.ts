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

const assetPattern = /\.(?:avif|bmp|css|gif|ico|jpeg|jpg|js|map|png|svg|txt|webm|webp|woff2?)$/i;

function isCacheableAsset(pathname: string) {
  return assetPattern.test(pathname) || pathname.startsWith('/_next/static/') || pathname.startsWith('/_next/image');
}

export function middleware(req: NextRequest) {
  if (hasSuspiciousQueryPayload(req.nextUrl)) {
    return NextResponse.json(
      { error: 'Request rejected due to invalid query parameters' },
      { status: 400 }
    );
  }

  const response = NextResponse.next();
  const { pathname } = req.nextUrl;

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

  if (!isCacheableAsset(pathname)) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
  }

  return response;
}

export const config = {
  matcher: '/:path*',
};
