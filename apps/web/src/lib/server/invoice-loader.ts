import { brand } from "@repo/copy";
import { createSupabaseServer } from "@/lib/supabase/server";
import { buildInvoicePdf, type PdfInvoice, type PdfItem } from "./invoice-pdf";

export async function loadInvoicePdf(id: string) {
  const supabase = await createSupabaseServer();
  const { data: invoice } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (!invoice) return null;
  const [{ data: items }, { data: salon }, { data: spayd }] = await Promise.all([
    supabase.from("invoice_items").select("description,quantity,unit,unit_price,vat_rate,total_gross").eq("invoice_id", id).order("position"),
    supabase.from("salons").select("brand_color").eq("id", invoice.salon_id).single(),
    supabase.rpc("invoice_spayd", { p_invoice: id }),
  ]);
  const bytes = await buildInvoicePdf(invoice as unknown as PdfInvoice, (items ?? []) as unknown as PdfItem[], {
    spayd: typeof spayd === "string" ? spayd : null,
    accent: salon?.brand_color ?? undefined,
    productName: brand.name,
  });
  return { bytes, invoice };
}