import type { Metadata } from "next";
import { FeatureGate } from "@/components/app/feature-gate";
import { InvoiceDetail } from "@/components/invoices/invoice-detail";

export const metadata: Metadata = { title: "Faktura" };

export default async function Page({ params }: PageProps<"/app/[slug]/faktury/[id]">) {
  const { id } = await params;
  return (
    <FeatureGate feature="invoicing">
      <InvoiceDetail invoiceId={id} />
    </FeatureGate>
  );
}
