import type { Metadata } from "next";
import { Suspense } from "react";
import { ClientDetail } from "@/components/clients/client-detail";

export const metadata: Metadata = { title: "Klient" };

export default async function Page({ params }: PageProps<"/app/[slug]/klienti/[id]">) {
  const { id } = await params;
  return (
    <Suspense>
      <ClientDetail clientId={id} />
    </Suspense>
  );
}
