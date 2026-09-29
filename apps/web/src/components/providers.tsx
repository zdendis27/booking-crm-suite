"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider, TooltipProvider } from "@repo/ui";
import { useState, type ReactNode } from "react";
import { PwaRegister } from "./pwa";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <ToastProvider>
          <PwaRegister />
          {children}
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
