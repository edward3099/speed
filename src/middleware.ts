import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Check if site is locked via environment variable
  const siteLocked = process.env.NEXT_PUBLIC_SITE_LOCKED?.trim();
  const isLocked = siteLocked === "true" || siteLocked === "1";

  // Allow API routes and static files to work even when locked
  const pathname = request.nextUrl.pathname;
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/locked')
  ) {
    return NextResponse.next();
  }

  // If locked, redirect to locked page
  if (isLocked) {
    return NextResponse.rewrite(new URL('/locked', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
