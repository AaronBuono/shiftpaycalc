import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';

// Optimistic check only: bounce visitors without a session cookie to /login.
// Every page and server action still verifies the session properly.
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|login|signup|_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
