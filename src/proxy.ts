import { NextResponse, type NextRequest } from "next/server";
import { isAdminHost } from "@/lib/domain";

export function proxy(request: NextRequest) {
  if (!isAdminHost(request.headers.get("host"))) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/auth/auto" ||
    pathname.startsWith("/staff")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" || pathname.startsWith("/staff") ? "/admin/dashboard" : "/admin/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/auth/auto", "/staff/:path*"],
};
