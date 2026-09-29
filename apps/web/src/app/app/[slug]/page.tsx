import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard/dashboard";

export const metadata: Metadata = { title: "Přehled" };

export default function SalonDashboardPage() {
  return <Dashboard />;
}
