import type { Metadata } from "next";
import { ClientsPage } from "@/components/clients/clients-page";

export const metadata: Metadata = { title: "Klienti" };

export default function Page() {
  return <ClientsPage />;
}
