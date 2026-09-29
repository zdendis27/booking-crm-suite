import { NextResponse, type NextRequest } from "next/server";
import { brand } from "@repo/copy";
import { buildVoucherPdf } from "@/lib/server/voucher-pdf";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET(request: NextRequest, { params }: RouteContext<"/api/vouchers/[id]/pdf">) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: voucher } = await supabase.from("vouchers").select("*").eq("id", id).maybeSingle();
  if (!voucher) return new NextResponse("Poukaz nenalezen", { status: 404 });
  const [{ data: salon }, service] = await Promise.all([
    supabase.from("salons").select("name,slug,brand_color").eq("id", voucher.salon_id).single(),
    voucher.service_id ? supabase.from("services").select("name").eq("id", voucher.service_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const bytes = await buildVoucherPdf(
    { code: voucher.code, initial_amount: voucher.initial_amount, balance: voucher.balance, recipient_name: voucher.recipient_name, message: voucher.message, expires_at: voucher.expires_at, service_name: service.data?.name },
    { salonName: salon?.name ?? "", accent: salon?.brand_color, bookingUrl: `${request.nextUrl.origin}/s/${salon?.slug}`, productName: brand.name },
  );
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="poukaz-${voucher.code}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
