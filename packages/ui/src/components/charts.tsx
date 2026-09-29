"use client";

import { motion } from "motion/react";
import { useId, useState, type PointerEvent, type ReactNode } from "react";
import { cn } from "../cn";
import { useMeasure } from "../hooks";

export interface ChartSeries {
  name: string;
  color: string;
  values: number[];
  dashed?: boolean;
}

function niceMax(value: number): number {
  if (value <= 0) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function smoothPath(points: [number, number][]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0]![0]},${points[0]![1]}`;
  let path = `M${points[0]![0]},${points[0]![1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    path += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return path;
}

interface AxisProps {
  labels: string[];
  series: ChartSeries[];
  height?: number;
  format?: (value: number) => string;
  className?: string;
  empty?: ReactNode;
}

const padding = { top: 12, right: 12, bottom: 28, left: 46 };

function useScale(values: number[][], height: number, width: number) {
  const max = niceMax(Math.max(0, ...values.flat()));
  const innerW = Math.max(0, width - padding.left - padding.right);
  const innerH = height - padding.top - padding.bottom;
  const y = (value: number) => padding.top + innerH - (value / max) * innerH;
  return { max, innerW, innerH, y };
}

function Grid({ max, width, height, format }: { max: number; width: number; height: number; format: (n: number) => string }) {
  const lines = [0, 0.25, 0.5, 0.75, 1];
  const innerH = height - padding.top - padding.bottom;
  return (
    <g>
      {lines.map((line) => {
        const y = padding.top + innerH - line * innerH;
        return (
          <g key={line}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="var(--border)" strokeDasharray={line === 0 ? undefined : "3 5"} />
            <text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="var(--fg-subtle)" className="tabular">
              {format(max * line)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function XLabels({ labels, width, height, count }: { labels: string[]; width: number; height: number; count: number }) {
  const innerW = width - padding.left - padding.right;
  const step = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(innerW / 64))));
  return (
    <g>
      {labels.map((label, index) => {
        if (index % step !== 0 && index !== labels.length - 1) return null;
        const x = count <= 1 ? padding.left + innerW / 2 : padding.left + (index / (count - 1)) * innerW;
        return (
          <text key={index} x={x} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--fg-subtle)">
            {label}
          </text>
        );
      })}
    </g>
  );
}

export function AreaChart({ labels, series, height = 240, format = (n) => String(Math.round(n)), className, empty }: AxisProps) {
  const [ref, { width }] = useMeasure<HTMLDivElement>();
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const count = labels.length;
  const { max, innerW, y } = useScale(
    series.map((s) => s.values),
    height,
    width,
  );
  const x = (index: number) => (count <= 1 ? padding.left + innerW / 2 : padding.left + (index / (count - 1)) * innerW);
  const hasData = series.some((s) => s.values.some((v) => v > 0));

  const paths = series.map((s) => {
    const points = s.values.map((value, index) => [x(index), y(value)] as [number, number]);
    const line = smoothPath(points);
    const area = points.length ? `${line} L${points.at(-1)![0]},${y(0)} L${points[0]![0]},${y(0)} Z` : "";
    return { line, area };
  });

  function onMove(event: PointerEvent<SVGRectElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const relative = (event.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(count - 1, Math.round(relative * (count - 1)))));
  }

  return (
    <div ref={ref} className={cn("relative w-full", className)} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} className="overflow-visible">
          <defs>
            {series.map((s, i) => (
              <linearGradient key={i} id={`${id}-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={s.color} stopOpacity="0.32" />
                <stop offset="1" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          <Grid max={max} width={width} height={height} format={format} />
          <XLabels labels={labels} width={width} height={height} count={count} />
          {hasData &&
            paths.map((p, i) => (
              <g key={i}>
                {!series[i]!.dashed && (
                  <motion.path
                    d={p.area}
                    fill={`url(#${id}-${i})`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.3 }}
                  />
                )}
                <motion.path
                  d={p.line}
                  fill="none"
                  stroke={series[i]!.color}
                  strokeWidth={series[i]!.dashed ? 2 : 2.75}
                  strokeLinecap="round"
                  strokeDasharray={series[i]!.dashed ? "5 6" : undefined}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                />
              </g>
            ))}
          {hover !== null && hasData && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={padding.top} y2={height - padding.bottom} stroke="var(--border-strong)" />
              {series.map((s, i) => (
                <circle key={i} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r="5" fill="var(--surface)" stroke={s.color} strokeWidth="2.5" />
              ))}
            </g>
          )}
          <rect
            x={padding.left}
            y={0}
            width={innerW}
            height={height}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
      )}
      {!hasData && width > 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-fg-subtle">{empty ?? "Zatím žádná data"}</div>
      )}
      {hover !== null && hasData && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-md"
          style={{ left: Math.min(Math.max(x(hover) - 60, 0), Math.max(0, width - 130)), top: 0 }}
        >
          <p className="mb-1 font-semibold text-fg">{labels[hover]}</p>
          {series.map((s, i) => (
            <p key={i} className="flex items-center gap-1.5 text-fg-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.name}: <span className="tabular font-semibold text-fg">{format(s.values[hover] ?? 0)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function BarChart({
  labels,
  series,
  height = 240,
  format = (n) => String(Math.round(n)),
  className,
  empty,
}: AxisProps) {
  const [ref, { width }] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const count = labels.length;
  const { max, innerW, innerH, y } = useScale(
    series.map((s) => s.values),
    height,
    width,
  );
  const group = count ? innerW / count : 0;
  const barWidth = Math.max(4, Math.min(38, (group * 0.62) / series.length));
  const hasData = series.some((s) => s.values.some((v) => v > 0));

  return (
    <div ref={ref} className={cn("relative w-full", className)} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height}>
          <Grid max={max} width={width} height={height} format={format} />
          {labels.map((label, index) => {
            const cx = padding.left + group * index + group / 2;
            const step = Math.max(1, Math.ceil(count / Math.max(2, Math.floor(innerW / 48))));
            return (
              <g key={index}>
                {series.map((s, si) => {
                  const value = s.values[index] ?? 0;
                  const barHeight = padding.top + innerH - y(value);
                  const bx = cx - (barWidth * series.length) / 2 + si * barWidth;
                  return (
                    <motion.rect
                      key={si}
                      x={bx + 1}
                      width={Math.max(2, barWidth - 2)}
                      rx={Math.min(6, barWidth / 3)}
                      fill={s.color}
                      opacity={hover === null || hover === index ? 1 : 0.4}
                      initial={{ y: padding.top + innerH, height: 0 }}
                      animate={{ y: y(value), height: barHeight }}
                      transition={{ duration: 0.7, delay: index * 0.02, ease: [0.22, 1, 0.36, 1] }}
                    />
                  );
                })}
                {(index % step === 0 || index === count - 1) && (
                  <text x={cx} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--fg-subtle)">
                    {label}
                  </text>
                )}
                <rect
                  x={padding.left + group * index}
                  y={0}
                  width={group}
                  height={height}
                  fill="transparent"
                  onPointerEnter={() => setHover(index)}
                  onPointerLeave={() => setHover(null)}
                />
              </g>
            );
          })}
        </svg>
      )}
      {!hasData && width > 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-fg-subtle">{empty ?? "Zatím žádná data"}</div>
      )}
      {hover !== null && hasData && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-md"
          style={{ left: Math.min(Math.max(padding.left + group * hover + group / 2 - 60, 0), Math.max(0, width - 130)), top: 0 }}
        >
          <p className="mb-1 font-semibold text-fg">{labels[hover]}</p>
          {series.map((s, i) => (
            <p key={i} className="flex items-center gap-1.5 text-fg-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.name}: <span className="tabular font-semibold text-fg">{format(s.values[hover] ?? 0)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sparkline({ values, color = "var(--accent)", height = 36, className }: { values: number[]; color?: string; height?: number; className?: string }) {
  const [ref, { width }] = useMeasure<HTMLDivElement>();
  const id = useId();
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const points = values.map((value, index) => [
    values.length <= 1 ? width / 2 : (index / (values.length - 1)) * width,
    height - 4 - ((value - min) / (max - min || 1)) * (height - 8),
  ] as [number, number]);
  const line = smoothPath(points);
  return (
    <div ref={ref} className={cn("w-full", className)} style={{ height }}>
      {width > 0 && values.length > 1 && (
        <svg width={width} height={height} className="overflow-visible">
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.28" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <motion.path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#${id})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} />
          <motion.path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth="2.25"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
      )}
    </div>
  );
}

export function Donut({
  data,
  size = 176,
  thickness = 22,
  center,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  center?: ReactNode;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface-3)" strokeWidth={thickness} />
        {total > 0 &&
          data.map((item, index) => {
            const length = (item.value / total) * circumference;
            const gap = data.length > 1 ? 3 : 0;
            const circle = (
              <motion.circle
                key={item.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={item.color}
                strokeWidth={thickness}
                strokeLinecap="butt"
                strokeDashoffset={-offset}
                initial={{ strokeDasharray: `0 ${circumference}` }}
                animate={{ strokeDasharray: `${Math.max(0, length - gap)} ${circumference}` }}
                transition={{ duration: 0.9, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
              />
            );
            offset += length;
            return circle;
          })}
      </svg>
      {center && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>}
    </div>
  );
}

export function ProgressRing({
  value,
  size = 96,
  thickness = 10,
  label,
}: {
  value: number;
  size?: number;
  thickness?: number;
  label?: ReactNode;
}) {
  const id = useId();
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3056d3" />
            <stop offset="1" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface-3)" strokeWidth={thickness} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - clamped) }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-center">{label}</div>
    </div>
  );
}

export const chartColors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];
