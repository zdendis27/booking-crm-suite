import type { Metadata } from "next";
import { OnboardingWizard } from "@/components/onboarding/wizard";

export const metadata: Metadata = { title: "Založení salonu" };

export default function CreateSalonPage() {
  return <OnboardingWizard />;
}
