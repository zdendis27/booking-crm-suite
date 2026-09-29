import { NextResponse, type NextRequest } from "next/server";
import { loadInvoicePdf } from "@/lib/server/invoice-loader";

export async function GET(_request: NextRequest, { params }: RouteContext<"/api/invoices/[id]/pdf">) {
  const { id } = await params;
  const result = await loadInvoicePdf(id);
  if (!result) return new NextResponse("Doklad nenalezen", { status: 404 });
  const filename = `${result.invoice.number ?? "koncept"}.pdf`;
  return new NextResponse(Buffer.from(result.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
