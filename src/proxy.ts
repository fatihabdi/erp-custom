import { NextResponse, type NextRequest } from "next/server";

// Pemeriksaan awal: tanpa cookie sesi, arahkan ke /login.
// Verifikasi sesi dan hak akses sebenarnya dilakukan di server (lib/auth.ts).
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = pathname === "/login" || pathname === "/api/health";
  const hasSession = request.cookies.has("erp_session");
  if (!isPublic && !hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
