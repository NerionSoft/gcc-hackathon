import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/infrastructure/auth";

// ============================================
// Configuration — customize these for your project
// ============================================

// TODO(starter): Add your public paths (no auth required)
const PUBLIC_PATHS = ["/api/auth", "/sign-in", "/sign-up"];

// TODO(starter): Add your auth pages (redirect to app if already signed in)
const AUTH_PAGES = ["/sign-in", "/forgot-password", "/reset-password"];

// TODO(starter): Add your protected page prefixes
const PROTECTED_PATH_PREFIXES = ["/dashboard", "/admin"];

// TODO(starter): Matches /api/<hexagone>/v1/* — adjust if your API convention differs
const PROTECTED_API_RE = /^\/api\/[^/]+\/v1(\/|$)/;

// ============================================
// Auth proxy — route protection
// ============================================

export async function authProxy(req: NextRequest): Promise<NextResponse | null> {
  const { pathname } = req.nextUrl;

  if (pathname === "/") return handleRoot(req);
  if (isAuthPage(pathname)) return handleAuthPage(req);
  if (isPublicPath(pathname)) return null;
  if (isProtectedPath(pathname)) return handleProtectedPath(req);

  return null;
}

// ============================================
// Route handlers
// ============================================

async function handleRoot(req: NextRequest): Promise<NextResponse> {
  const session = await getSession(req.headers);
  // TODO(starter): Change redirect targets for your app
  const target = session ? "/dashboard" : "/sign-in";
  return NextResponse.redirect(new URL(target, req.url));
}

async function handleAuthPage(req: NextRequest): Promise<NextResponse | null> {
  const session = await getSession(req.headers);
  if (!session) return null;
  const callbackUrl = req.nextUrl.searchParams.get("callbackUrl");
  // TODO(starter): Change default redirect after sign-in
  const target = isSafeRedirect(callbackUrl) ? callbackUrl : "/dashboard";
  return NextResponse.redirect(new URL(target, req.url));
}

async function handleProtectedPath(req: NextRequest): Promise<NextResponse | null> {
  const session = await getSession(req.headers);
  if (session) return null;
  if (isApiPath(req.nextUrl.pathname)) return unauthorizedJson();
  return redirectToSignIn(req, req.nextUrl.pathname);
}

// ============================================
// Response helpers
// ============================================

function unauthorizedJson(): NextResponse {
  return NextResponse.json(
    { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
    { status: 401 },
  );
}

function redirectToSignIn(req: NextRequest, callbackPath: string): NextResponse {
  const signInUrl = new URL("/sign-in", req.url);
  signInUrl.searchParams.set("callbackUrl", callbackPath);
  return NextResponse.redirect(signInUrl);
}

// ============================================
// Path matchers
// ============================================

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname.startsWith(path));
}

function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some((p) => pathname.startsWith(p));
}

function isProtectedPath(pathname: string): boolean {
  return (
    PROTECTED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    PROTECTED_API_RE.test(pathname)
  );
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

function isSafeRedirect(url: string | null): url is string {
  return typeof url === "string" && url.startsWith("/") && !url.startsWith("//");
}

// ============================================
// Session helper
// ============================================

function getSession(headers: Headers) {
  return auth.api.getSession({ headers });
}
