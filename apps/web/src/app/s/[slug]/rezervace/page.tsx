import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookingFlow } from "@/components/booking/booking-flow";
import { getPublicSalon } from "@/lib/server/public-salon";

export async function generateMetadata({ params }: PageProps<"/s/[slug]/rezervace">): Promise<Metadata> {
  const { slug } = await params;
  const salon = await getPublicSalon(slug);
  return { title: salon ? `Rezervace · ${salon.name}` : "Rezervace" };
}

export default async function BookingPage({ params, searchParams }: PageProps<"/s/[slug]/rezervace">) {
  const { slug } = await params;
  const query = await searchParams;
  const salon = await getPublicSalon(slug);
  if (!salon) notFound();
  const service = typeof query.sluzba === "string" ? query.sluzba : undefined;
  return <BookingFlow salon={salon} initialService={service} />;
}
