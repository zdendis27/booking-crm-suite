import type { Metadata } from "next";
import { Suspense } from "react";
import { CustomerHome } from "@/components/customer/customer-home";

export const metadata: Metadata = { title: "Moje rezervace" };

export default function CustomerPage() {
  return (
    <Suspense>
      <CustomerHome />
    </Suspense>
  );
}
