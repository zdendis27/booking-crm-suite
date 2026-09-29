"use client";

import { motion } from "motion/react";
import { Bell, CalendarCheck, Check, Sparkles, TrendingUp } from "lucide-react";

const bookings = [
  { time: "9:00", name: "Petra N.", service: "Barvení + střih", color: "#3056d3", span: 2 },
  { time: "11:30", name: "Lucie K.", service: "Manikúra gel", color: "#ec4899", span: 1 },
  { time: "13:00", name: "Jana M.", service: "Lash lifting", color: "#16a34a", span: 1 },
  { time: "14:30", name: "Tereza V.", service: "Masáž zad", color: "#f97316", span: 2 },
];

export function HeroMockup() {
  return (
    <div className="relative mx-auto w-full max-w-md text-fg">
      <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-white/25 opacity-60 blur-3xl" />
      <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }} className="rounded-3xl border border-border bg-surface p-4 shadow-2xl">
        <div className="flex items-center justify-between px-1 pb-3">
          <div>
            <p className="text-xs text-fg-muted">Dnes</p>
            <p className="font-semibold">Čtvrtek 12. března</p>
          </div>
          <span className="rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success">4 rezervace</span>
        </div>
        <div className="grid gap-2">
          {bookings.map((booking, index) => (
            <motion.div key={booking.time} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + index * 0.15, type: "spring", stiffness: 200, damping: 20 }} className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/60 p-3" style={{ borderLeft: `4px solid ${booking.color}`, minHeight: 52 + (booking.span - 1) * 14 }}>
              <span className="w-11 text-sm font-semibold tabular">{booking.time}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{booking.name}</span>
                <span className="block truncate text-xs text-fg-muted">{booking.service}</span>
              </span>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, scale: 0.8, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: 1.2, type: "spring" }} className="absolute -left-3 -top-4 flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-xl sm:-left-10">
        <span className="grid size-10 place-items-center rounded-xl bg-[#3056d3] text-white">
          <Bell className="size-5" />
        </span>
        <span>
          <span className="block text-sm font-semibold">Nová rezervace</span>
          <span className="block text-xs text-fg-muted">Kateřina P. · zítra 10:30</span>
        </span>
      </motion.div>

      <motion.div initial={{ opacity: 0, scale: 0.8, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: 1.6, type: "spring" }} className="absolute -bottom-5 -right-2 flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-xl sm:-right-8">
        <span className="grid size-10 place-items-center rounded-xl bg-success-soft text-success">
          <TrendingUp className="size-5" />
        </span>
        <span>
          <span className="block text-xs text-fg-muted">Tržba tento týden</span>
          <span className="block text-lg font-bold tabular">48 250 Kč</span>
        </span>
      </motion.div>

      <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 2, type: "spring" }} className="absolute -bottom-4 left-6 hidden items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 text-xs font-semibold shadow-lg sm:flex">
        <CalendarCheck className="size-4 text-accent" /> 6. razítko
        <Sparkles className="size-4 text-[#f97316]" /> odměna zdarma
        <Check className="size-4 text-success" />
      </motion.div>
    </div>
  );
}
