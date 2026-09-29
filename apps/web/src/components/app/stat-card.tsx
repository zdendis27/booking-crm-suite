"use client";

import { AnimatedNumber, Card, Sparkline, cn } from "@repo/ui";
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

const toneColor = {
  accent: "#3056d3",
  success: "#16a34a",
  pink: "#ec4899",
  info: "#0891b2",
  warning: "#f97316",
  danger: "#dc2626",
};

export function SectionHeading({ icon: Icon, title, subtitle, color = "#3056d3", className }: { icon: LucideIcon; title: string; subtitle?: ReactNode; color?: string; className?: string }) {
  return (
    <div className={cn("mb-4 flex items-center gap-3", className)}>
      <span className="grid size-11 shrink-0 place-items-center rounded-xl text-white" style={{ background: color, boxShadow: `0 10px 20px -8px ${color}` }}>
        <Icon className="size-[22px]" />
      </span>
      <div className="min-w-0">
        <h2 className="text-xl font-bold leading-tight tracking-tight text-fg">{title}</h2>
        {subtitle && <p className="text-sm text-fg-muted">{subtitle}</p>}
      </div>
    </div>
  );
}

const tones = {
  accent: "from-[#2f55d4] to-[#4f7cf0]",
  success: "from-[#16a34a] to-[#22c55e]",
  pink: "from-[#ec4899] to-[#f472b6]",
  info: "from-[#0891b2] to-[#06b6d4]",
  warning: "from-[#f97316] to-[#fb923c]",
  danger: "from-[#dc2626] to-[#f87171]",
};

export function Delta({ current, previous, inverse, suffix = "" }: { current: number; previous: number; inverse?: boolean; suffix?: string }) {
  if (!previous && !current) return null;
  if (!previous) return <span className="text-xs text-fg-subtle">nové</span>;
  const change = (current - previous) / Math.abs(previous);
  const flat = Math.abs(change) < 0.005;
  const good = inverse ? change < 0 : change > 0;
  const Icon = flat ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold tabular",
        flat ? "bg-surface-2 text-fg-muted" : good ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(change * 100).toLocaleString("cs-CZ", { maximumFractionDigits: 0 })} %{suffix}
    </span>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  format,
  tone = "accent",
  delta,
  spark,
  footer,
  loading,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  format?: (n: number) => string;
  tone?: keyof typeof tones;
  delta?: ReactNode;
  spark?: number[];
  footer?: ReactNode;
  loading?: boolean;
  className?: string;
}) {
  return (
    <Card interactive className={cn("group relative overflow-hidden p-4 sm:p-5", className)}>
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: toneColor[tone] }} />
      <span className="pointer-events-none absolute -right-8 -top-8 size-20 rounded-full opacity-[0.1]" style={{ background: toneColor[tone] }} />
      <div className="flex items-start justify-between gap-3">
        <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6", tones[tone])}>
          <Icon className="h-[22px] w-[22px]" />
        </span>
        {delta}
      </div>
      <p className="mt-4 text-sm text-fg-muted">{label}</p>
      {loading ? (
        <div className="ui-skeleton mt-1.5 h-8 w-28" />
      ) : (
        <p className="mt-0.5 text-2xl font-semibold tracking-tight tabular sm:text-[1.7rem]">
          <AnimatedNumber value={value} format={format} />
        </p>
      )}
      {spark && spark.length > 1 && <Sparkline values={spark} className="mt-3" color={`var(--chart-${tone === "success" ? 2 : tone === "pink" ? 4 : tone === "info" ? 5 : tone === "warning" ? 3 : 1})`} />}
      {footer && <div className="mt-3 text-xs text-fg-muted">{footer}</div>}
    </Card>
  );
}
