"use client";

import { Skeleton, cn } from "@repo/ui";
import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  hide?: "sm" | "md" | "lg" | "xl";
}

const hideClass = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell", xl: "hidden xl:table-cell" };

export function DataTable<T>({
  columns,
  rows,
  getKey,
  onRowClick,
  loading,
  empty,
  className,
  skeletonRows = 6,
}: {
  columns: Column<T>[];
  rows: T[];
  getKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  empty?: ReactNode;
  className?: string;
  skeletonRows?: number;
}) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-surface shadow-xs", className)}>
      <div className="ui-scroll overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2/60 text-left text-xs uppercase tracking-wide text-fg-subtle">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn("whitespace-nowrap px-4 py-3 font-medium", column.align === "right" && "text-right", column.align === "center" && "text-center", column.hide && hideClass[column.hide])}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: skeletonRows }, (_, index) => (
                  <tr key={index} className="border-b border-border last:border-0">
                    {columns.map((column) => (
                      <td key={column.key} className={cn("px-4 py-3.5", column.hide && hideClass[column.hide])}>
                        <Skeleton className="h-4 w-full max-w-32" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => (
                  <tr
                    key={getKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn("border-b border-border transition-colors last:border-0", onRowClick && "cursor-pointer hover:bg-surface-2/70")}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={cn("px-4 py-3", column.align === "right" && "text-right tabular", column.align === "center" && "text-center", column.hide && hideClass[column.hide], column.className)}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {!loading && rows.length === 0 && empty}
    </div>
  );
}
