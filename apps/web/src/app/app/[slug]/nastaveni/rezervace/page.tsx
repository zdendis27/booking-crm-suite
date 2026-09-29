import type { Metadata } from "next";
import { BookingRules } from "@/components/settings/booking-rules";

export const metadata: Metadata = { title: "Pravidla rezervací" };

export default function Page() {
  return <BookingRules />;
}
