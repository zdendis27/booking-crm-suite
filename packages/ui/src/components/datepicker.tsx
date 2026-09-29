"use client";

import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "../cn";
import { addMonths, formatDayShort, formatMonth, monthGrid, startOfMonth, todayISO, weekdayLabels } from "../dates";
import { Popover } from "./overlay";

export function MonthCalendar({
  value,
  onChange,
  min,
  max,
  marked,
  disabledDates,
  className,
}: {
  value: string | null;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  marked?: Set<string>;
  disabledDates?: (date: string) => boolean;
  className?: string;
}) {
  const today = todayISO();
  const [month, setMonth] = useState(startOfMonth(value ?? today));
  const [direction, setDirection] = useState(1);
  const days = monthGrid(month);

  function move(step: number) {
    setDirection(step);
    setMonth(addMonths(month, step));
  }

  return (
    <div className={cn("w-[19.5rem] max-w-full select-none", className)}>
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={() => move(-1)} className="rounded-sm p-1.5 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg" aria-label="Předchozí měsíc">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold capitalize">{formatMonth(month)}</p>
        <button type="button" onClick={() => move(1)} className="rounded-sm p-1.5 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg" aria-label="Další měsíc">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
        {weekdayLabels.map((label) => (
          <span key={label} className="py-1">
            {label}
          </span>
        ))}
      </div>
      <div className="relative overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.div
            key={month}
            custom={direction}
            initial={{ opacity: 0, x: direction * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -24 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="grid grid-cols-7 gap-1"
          >
            {days.map((day) => {
              const inMonth = day.slice(0, 7) === month.slice(0, 7);
              const disabled = (min && day < min) || (max && day > max) || disabledDates?.(day);
              const selected = value === day;
              return (
                <button
                  key={day}
                  type="button"
                  disabled={!!disabled}
                  onClick={() => onChange(day)}
                  className={cn(
                    "relative flex h-9 items-center justify-center rounded-sm text-sm tabular transition-all duration-150",
                    inMonth ? "text-fg" : "text-fg-subtle/60",
                    !selected && !disabled && "hover:bg-surface-2",
                    day === today && !selected && "font-semibold text-accent",
                    selected && "bg-[image:var(--gradient-brand)] font-semibold text-white shadow-glow",
                    disabled && "cursor-not-allowed opacity-30",
                  )}
                >
                  {Number(day.slice(8))}
                  {marked?.has(day) && !selected && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" />}
                </button>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = "Vyberte datum",
  className,
  size = "md",
}: {
  value: string | null;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          type="button"
          className={cn(
            "inline-flex w-full items-center gap-2.5 rounded-md border border-border bg-surface px-3 text-left shadow-xs transition-all hover:border-border-strong focus:border-accent focus:outline-none focus:ring-4 focus:ring-[var(--ring)]",
            size === "sm" ? "h-9 text-sm" : "h-10 text-sm",
            !value && "text-fg-subtle",
            className,
          )}
        >
          <CalendarDays className="h-4 w-4 text-fg-subtle" />
          {value ? formatDayShort(value) : placeholder}
        </button>
      }
    >
      <MonthCalendar
        value={value}
        min={min}
        max={max}
        onChange={(next) => {
          onChange(next);
          setOpen(false);
        }}
      />
    </Popover>
  );
}
