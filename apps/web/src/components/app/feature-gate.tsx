"use client";

import { featureLabels, planNames } from "@repo/copy";
import { Button, Illustration } from "@repo/ui";
import { Lock, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useSalon } from "./salon-context";

const requiredPlan: Record<string, string> = {
  loyalty: "SOLO",
  automations: "SOLO",
  waitlist: "SOLO",
  payments: "PRO",
  vouchers: "PRO",
  finance: "PRO",
  deposits: "PRO",
  invoicing: "BUSINESS",
  commissions: "BUSINESS",
  marketing: "BUSINESS",
  ai: "BUSINESS",
};

export function FeatureGate({ feature, children }: { feature: string; children: ReactNode }) {
  const { hasFeature, salon, planName } = useSalon();
  if (hasFeature(feature)) return <>{children}</>;
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-16 text-center">
      <Illustration icon={Lock} tone="pink" />
      <h2 className="mt-6 text-2xl font-semibold tracking-tight">{featureLabels[feature] ?? "Tato funkce"} je v jiném tarifu</h2>
      <p className="mt-2 text-fg-muted">
        Váš tarif {planName || planNames[salon.plan_code]} tuto funkci neobsahuje. Dostupná je od tarifu {requiredPlan[feature] ?? "PRO"}.
      </p>
      <Button asChild size="lg" className="mt-7" leading={undefined}>
        <Link href={`/app/${salon.slug}/nastaveni/tarif`}>
          <Sparkles className="h-4 w-4" />
          Zobrazit tarify
        </Link>
      </Button>
    </div>
  );
}
