import type { Metadata } from "next";
import { SalonProfile } from "@/components/settings/salon-profile";

export const metadata: Metadata = { title: "Nastavení salonu" };

export default function Page() {
  return <SalonProfile />;
}
