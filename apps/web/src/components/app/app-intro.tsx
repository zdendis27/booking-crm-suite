"use client";

import { LogoMark } from "@repo/ui";
import { brand } from "@repo/copy";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

export function AppIntro({ name }: { name: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem("intro-seen") === "1";
    } catch {
      seen = false;
    }
    if (seen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setShow(true);
    const timer = setTimeout(() => {
      setShow(false);
      try {
        sessionStorage.setItem("intro-seen", "1");
      } catch {
        return;
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="intro"
          className="fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-[#2340a8] text-white"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.span className="absolute size-[60vmax] rounded-full bg-[#3056d3]" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
          <motion.span className="absolute size-[36vmax] rounded-full bg-[#4f7cf0]/60" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.9, delay: 0.1, ease: [0.22, 1, 0.36, 1] }} />
          <div className="relative grid justify-items-center gap-5">
            <motion.div initial={{ scale: 0, rotate: -25 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.15 }} className="rounded-3xl bg-white p-3 shadow-2xl">
              <LogoMark size={64} />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.5 }} className="text-center">
              <p className="text-3xl font-bold tracking-tight">{name}</p>
              <p className="mt-1 text-sm text-white/75">{brand.name}</p>
            </motion.div>
            <div className="h-1 w-40 overflow-hidden rounded-full bg-white/25">
              <motion.div className="h-full rounded-full bg-white" initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ delay: 0.3, duration: 1, ease: "easeInOut" }} />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
