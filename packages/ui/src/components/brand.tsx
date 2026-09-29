import { useId } from "react";
import { cn } from "../cn";

export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={cn("shrink-0", className)} aria-hidden>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2f55d4" />
          <stop offset="0.55" stopColor="#3f6be0" />
          <stop offset="1" stopColor="#4f7cf0" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="12" fill={`url(#${id}-g)`} />
      <path d="M11.5 13h17M20 13v15" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" fill="none" />
      <circle cx="29" cy="28" r="2.6" fill="#fff" opacity="0.92" />
    </svg>
  );
}

export function Logo({ name, size = 34, className }: { name: string; size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      <span className="text-lg font-semibold tracking-tight text-fg">{name}</span>
    </span>
  );
}
