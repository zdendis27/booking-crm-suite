import type { Metadata } from "next";
import { VouchersPage } from "@/components/vouchers/vouchers-page";

export const metadata: Metadata = { title: "Poukazy" };

export default function Page() {
  return <VouchersPage />;
}
