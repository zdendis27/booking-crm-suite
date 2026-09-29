import type { Metadata } from "next";
import { PlanSettings } from "@/components/settings/plan-settings";

export const metadata: Metadata = { title: "Tarif" };

export default function Page() {
  return <PlanSettings />;
}
