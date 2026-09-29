import type { Metadata } from "next";
import { MarketingPage } from "@/components/marketing/marketing-page";

export const metadata: Metadata = { title: "Marketing" };

export default function Page() {
  return <MarketingPage />;
}
