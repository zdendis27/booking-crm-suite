"use client";

import { cn } from "@repo/ui";
import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";

export function OtpInput({
  value,
  onChange,
  length = 6,
  disabled,
  onComplete,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  onComplete?: (value: string) => void;
  invalid?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  function set(index: number, digit: string) {
    const chars = value.padEnd(length, " ").split("");
    chars[index] = digit || " ";
    const next = chars.join("").replace(/ /g, "");
    onChange(next);
    if (digit && index < length - 1) refs.current[index + 1]?.focus();
    if (next.length === length) onComplete?.(next);
  }

  function onKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !value[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
    if (event.key === "ArrowLeft" && index > 0) refs.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < length - 1) refs.current[index + 1]?.focus();
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    event.preventDefault();
    onChange(pasted);
    refs.current[Math.min(pasted.length, length - 1)]?.focus();
    if (pasted.length === length) onComplete?.(pasted);
  }

  return (
    <div className="flex justify-center gap-2 sm:gap-2.5">
      {Array.from({ length }, (_, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          value={value[index] ?? ""}
          onChange={(event) => set(index, event.target.value.replace(/\D/g, "").slice(-1))}
          onKeyDown={(event) => onKeyDown(index, event)}
          onPaste={onPaste}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={1}
          disabled={disabled}
          aria-label={`Číslice ${index + 1}`}
          className={cn(
            "h-14 w-11 rounded-md border bg-surface text-center text-xl font-semibold tabular shadow-xs transition-all sm:h-16 sm:w-13 sm:text-2xl",
            "focus:border-accent focus:outline-none focus:ring-4 focus:ring-[var(--ring)]",
            invalid ? "border-danger" : value[index] ? "border-accent/60" : "border-border",
          )}
        />
      ))}
    </div>
  );
}
