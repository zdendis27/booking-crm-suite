"use client";

import { cn } from "@repo/ui";
import { motion } from "motion/react";
import { Bell, Building2, CalendarCog, CreditCard, Globe, MapPin, ShieldCheck, Store } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/app/page-header";
import { useSalon } from "@/components/app/salon-context";

const items = [
  { href: "salon", label: "Salon a vzhled", icon: Store },
  { href: "miniweb", label: "Mini web", icon: Globe },
  { href: "pobocky", label: "Pobočky a doba", icon: MapPin },
  { href: "rezervace", label: "Pravidla rezervací", icon: CalendarCog },
  { href: "fakturace", label: "Fakturační údaje", icon: Building2 },
  { href: "tarif", label: "Tarif", icon: CreditCard },
  { href: "notifikace", label: "Upozornění", icon: Bell },
  { href: "data", label: "Data a soukromí", icon: ShieldCheck },
];

export function SettingsShell({ children }: { children: ReactNode }) {
  const { salon } = useSalon();
  const pathname = usePathname();
  const base = `/app/${salon.slug}/nastaveni`;
  return (
    <div>
      <PageHeader title="Nastavení" description="Všechno, co se týká vašeho salonu, na jednom místě." />
      <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        <nav className="ui-scroll -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0" aria-label="Sekce nastavení">
          {items.map((item) => {
            const active = pathname === `${base}/${item.href}`;
            return (
              <Link
                key={item.href}
                href={`${base}/${item.href}`}
                className={cn("group relative flex shrink-0 items-center gap-3 whitespace-nowrap rounded-md px-3.5 py-2.5 text-sm font-medium transition-colors", active ? "text-accent" : "text-fg-muted hover:text-fg")}
              >
                {active && <motion.span layoutId="settings-pill" className="absolute inset-0 rounded-md bg-accent-soft" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                <item.icon className="relative h-[18px] w-[18px]" />
                <span className="relative">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
