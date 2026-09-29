"use client";

import { motion } from "motion/react";
import { useId, type ReactNode } from "react";
import { cn } from "../cn";

export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
  className,
  variant = "underline",
}: {
  value: T;
  onChange: (value: T) => void;
  tabs: { value: T; label: ReactNode; count?: number }[];
  className?: string;
  variant?: "underline" | "pill";
}) {
  const id = useId();
  return (
    <div
      role="tablist"
      className={cn(
        "ui-scroll flex gap-1 overflow-x-auto",
        variant === "underline" ? "border-b border-border" : "rounded-lg bg-surface-2 p-1",
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              "relative shrink-0 whitespace-nowrap px-3.5 py-2.5 text-sm font-medium outline-none transition-colors",
              variant === "pill" && "rounded-md py-2",
              active ? "text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {active && variant === "underline" && (
              <motion.span
                layoutId={`tab-underline-${id}`}
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[image:var(--gradient-brand)]"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            {active && variant === "pill" && (
              <motion.span
                layoutId={`tab-pill-${id}`}
                className="absolute inset-0 rounded-md bg-surface shadow-sm"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <span className="relative inline-flex items-center gap-2">
              {tab.label}
              {tab.count !== undefined && (
                <span className="rounded-full bg-surface-3 px-1.5 text-[11px] font-semibold tabular-nums text-fg-muted">{tab.count}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
