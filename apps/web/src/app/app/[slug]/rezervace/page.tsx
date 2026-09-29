import type { Metadata } from "next";
import { Suspense } from "react";
import { BookingsPage } from "@/components/bookings/bookings-page";

export const metadata: Metadata = { title: "Rezervace" };

export default function Page() {
  return (
    <Suspense>
      <BookingsPage />
    </Suspense>
  );
}
