import type { Metadata } from "next";
import { ServicesPage } from "@/components/services/services-page";

export const metadata: Metadata = { title: "Služby" };

export default function Page() {
  return <ServicesPage />;
}
