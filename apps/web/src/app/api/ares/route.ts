import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

interface AresResponse {
  ico?: string;
  obchodniJmeno?: string;
  dic?: string;
  sidlo?: {
    nazevUlice?: string;
    cisloDomovni?: number;
    cisloOrientacni?: number;
    cisloOrientacniPismeno?: string;
    nazevCastiObce?: string;
    nazevObce?: string;
    psc?: number;
    textovaAdresa?: string;
  };
}

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nepřihlášeno" }, { status: 401 });

  const ico = (request.nextUrl.searchParams.get("ico") ?? "").replace(/\s+/g, "");
  if (!/^\d{8}$/.test(ico)) return NextResponse.json({ error: "IČO má 8 číslic" }, { status: 400 });

  try {
    const response = await fetch(`https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${ico}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (response.status === 404) return NextResponse.json({ error: "Subjekt s tímto IČO nebyl nalezen" }, { status: 404 });
    if (!response.ok) return NextResponse.json({ error: "ARES je momentálně nedostupný" }, { status: 502 });
    const data = (await response.json()) as AresResponse;
    const sidlo = data.sidlo ?? {};
    const number = [sidlo.cisloDomovni, sidlo.cisloOrientacni ? `${sidlo.cisloOrientacni}${sidlo.cisloOrientacniPismeno ?? ""}` : null].filter(Boolean).join("/");
    const street = [sidlo.nazevUlice ?? sidlo.nazevCastiObce ?? sidlo.nazevObce, number].filter(Boolean).join(" ");
    return NextResponse.json({
      ico: data.ico ?? ico,
      name: data.obchodniJmeno ?? "",
      dic: data.dic ?? "",
      street,
      city: sidlo.nazevObce ?? "",
      zip: sidlo.psc ? String(sidlo.psc).replace(/^(\d{3})(\d{2})$/, "$1 $2") : "",
    });
  } catch {
    return NextResponse.json({ error: "ARES se nepodařilo zavolat" }, { status: 502 });
  }
}
