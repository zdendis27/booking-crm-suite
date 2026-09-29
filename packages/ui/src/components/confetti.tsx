"use client";

import { motion } from "motion/react";
import { useMemo } from "react";

const colors = ["#3056d3", "#16a34a", "#f97316", "#ec4899", "#facc15", "#06b6d4"];

export function Confetti({ count = 42 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, index) => ({
        id: index,
        angle: (Math.PI * 2 * index) / count + Math.random() * 0.4,
        distance: 110 + Math.random() * 190,
        rotate: Math.random() * 720 - 360,
        size: 6 + Math.random() * 7,
        color: colors[index % colors.length]!,
        round: index % 3 === 0,
        delay: Math.random() * 0.08,
      })),
    [count],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden>
      <div className="absolute left-1/2 top-1/2">
        {pieces.map((piece) => (
          <motion.span
            key={piece.id}
            className="absolute block"
            style={{
              width: piece.size,
              height: piece.round ? piece.size : piece.size * 0.5,
              background: piece.color,
              borderRadius: piece.round ? "50%" : 2,
            }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.4 }}
            animate={{
              x: Math.cos(piece.angle) * piece.distance,
              y: Math.sin(piece.angle) * piece.distance + 90,
              opacity: 0,
              rotate: piece.rotate,
              scale: 1,
            }}
            transition={{ duration: 1.5, delay: piece.delay, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
      </div>
    </div>
  );
}
