import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const email = process.env.DEMO_EMAIL;
  const password = process.env.DEMO_PASSWORD;
  if (process.env.NODE_ENV === "production" || !email || !password) {
    return new NextResponse("Nedostupné", { status: 404 });
  }
  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return NextResponse.redirect(new URL("/prihlaseni?chyba=Demo%20p%C5%99ihl%C3%A1%C5%A1en%C3%AD%20selhalo", request.nextUrl.origin));
  }
  const next = request.nextUrl.searchParams.get("next");
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/app";
  return NextResponse.redirect(new URL(target, request.nextUrl.origin));
}
