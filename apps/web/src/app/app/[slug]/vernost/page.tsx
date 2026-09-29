import type { Metadata } from "next";
import { LoyaltyPage } from "@/components/loyalty/loyalty-page";

export const metadata: Metadata = { title: "Věrnostní program" };

export default function Page() {
  return <LoyaltyPage />;
}
