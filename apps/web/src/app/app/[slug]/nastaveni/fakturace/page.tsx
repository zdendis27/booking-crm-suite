import type { Metadata } from "next";
import { BillingProfileSettings } from "@/components/settings/billing-profile";

export const metadata: Metadata = { title: "Fakturační údaje" };

export default function Page() {
  return <BillingProfileSettings />;
}
