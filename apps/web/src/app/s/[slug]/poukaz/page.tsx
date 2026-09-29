import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VoucherPurchase } from "@/components/booking/voucher-purchase";
import { getPublicSalon } from "@/lib/server/public-salon";

export async function generateMetadata({ params }: PageProps<"/s/[slug]/poukaz">): Promise<Metadata> {
  const { slug } = await params;
  const salon = await getPublicSalon(slug);
  return { title: salon ? `Dárkový poukaz · ${salon.name}` : "Dárkový poukaz" };
}

export default async function VoucherPage({ params, searchParams }: PageProps<"/s/[slug]/poukaz">) {
  const { slug } = await params;
  const query = await searchParams;
  const salon = await getPublicSalon(slug);
  if (!salon) notFound();
  return <VoucherPurchase salon={salon} success={query.hotovo === "1"} />;
}
