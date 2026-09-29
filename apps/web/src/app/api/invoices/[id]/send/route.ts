import { NextResponse, type NextRequest } from "next/server";
import { brand } from "@repo/copy";
import { isEmailConfigured, sendEmail } from "@/lib/server/email";
import { loadInvoicePdf } from "@/lib/server/invoice-loader";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function POST(request: NextRequest, { params }: RouteContext<"/api/invoices/[id]/send">) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { to?: string };
  const supabase = await createSupabaseServer();
  const result = await loadInvoicePdf(id);
  if (!result) return NextResponse.json({ error: "Doklad nenalezen" }, { status: 404 });
  const { invoice } = result;
  if (invoice.status === "draft") return NextResponse.json({ error: "Koncept nelze odeslat" }, { status: 400 });
  const to = body.to || invoice.customer_email;
  if (!to) return NextResponse.json({ error: "Odběratel nemá e-mail" }, { status: 400 });
  if (!isEmailConfigured()) {
    return NextResponse.json({ error: "E-maily zatím nejsou nastavené (chybí RESEND_API_KEY v .env.local)." }, { status: 503 });
  }
  const supplier = (invoice.supplier ?? {}) as { name?: string };
  const label = invoice.kind === "credit_note" ? "dobropis" : invoice.kind === "proforma" ? "zálohová faktura" : "faktura";
  try {
    await sendEmail({
      to,
      subject: `${label[0]!.toUpperCase()}${label.slice(1)} ${invoice.number} od ${supplier.name ?? brand.name}`,
      html: `<p>Dobrý den,</p><p>v příloze zasíláme ${label} č. <strong>${invoice.number}</strong>. Splatnost: ${invoice.due_date ?? ""}.</p><p>Děkujeme,<br/>${supplier.name ?? ""}</p>`,
      attachments: [{ filename: `${invoice.number}.pdf`, content: Buffer.from(result.bytes) }],
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
  await supabase.from("invoices").update({ sent_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ ok: true, to });
}
