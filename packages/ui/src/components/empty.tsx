"use client";

import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "../cn";

export function Illustration({ icon: Icon, tone = "accent", size = 132 }: { icon: LucideIcon; tone?: "accent" | "success" | "pink" | "info" | "warning"; size?: number }) {
  const id = useId();
  const colors = {
    accent: ["#2f55d4", "#4f7cf0"],
    success: ["#16a34a", "#22c55e"],
    pink: ["#ec4899", "#f472b6"],
    info: ["#0891b2", "#06b6d4"],
    warning: ["#f97316", "#fb923c"],
  }[tone];
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 160 160" width={size} height={size} aria-hidden className="absolute inset-0">
        <defs>
          <linearGradient id={`${id}-a`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={colors[0]} stopOpacity="0.22" />
            <stop offset="1" stopColor={colors[1]} stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id={`${id}-b`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={colors[0]} />
            <stop offset="1" stopColor={colors[1]} />
          </linearGradient>
        </defs>
        <motion.path
          d="M80 10c31 0 62 18 68 50s-8 62-38 78-70 10-88-22S4 58 28 34 60 10 80 10z"
          fill={`url(#${id}-a)`}
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformOrigin: "80px 80px" }}
        />
        <circle cx="26" cy="120" r="5" fill={colors[1]} opacity="0.35" />
        <circle cx="140" cy="36" r="4" fill={colors[0]} opacity="0.4" />
        <circle cx="134" cy="128" r="7" fill={colors[0]} opacity="0.18" />
        <rect x="18" y="30" width="10" height="10" rx="3" fill={colors[1]} opacity="0.3" transform="rotate(18 23 35)" />
      </svg>
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <span
          className="flex items-center justify-center rounded-[26px] text-white shadow-glow"
          style={{ width: size * 0.42, height: size * 0.42, background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})` }}
        >
          <Icon style={{ width: size * 0.2, height: size * 0.2 }} strokeWidth={1.8} />
        </span>
      </motion.div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  tone,
  className,
  compact,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: "accent" | "success" | "pink" | "info" | "warning";
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "px-4 py-8" : "px-6 py-14", className)}>
      <Illustration icon={icon} tone={tone} size={compact ? 96 : 132} />
      <h3 className="mt-4 text-base font-semibold tracking-tight">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
