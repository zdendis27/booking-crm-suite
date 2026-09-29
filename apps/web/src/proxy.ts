import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

const protectedPrefixes = ["/app", "/moje", "/zalozit-salon"];

export async function proxy(request: NextRequest) {
  const { response, signedIn } = await updateSession(request);
  const path = request.nextUrl.pathname;
  const needsAuth = protectedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  if (needsAuth && !signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/prihlaseni";
    url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon|apple-icon|api/cron|api/stripe|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)"],
};
