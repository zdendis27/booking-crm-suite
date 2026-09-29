"use client";

import { Button, EmptyState, Popover, cn } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing, CalendarPlus, CalendarX, Clock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/time";
import { useSalon } from "./salon-context";

interface NotificationRow {
  id: string;
  type: string;
  payload: Record<string, any>;
  created_at: string;
  read_at: string | null;
}

function describe(row: NotificationRow, timeZone: string) {
  const p = row.payload;
  const who = p.client ? `${p.client.first_name} ${p.client.last_name}`.trim() : "";
  const when = p.starts_at ? formatDateTime(p.starts_at, timeZone) : "";
  switch (row.type) {
    case "staff_new_booking":
      return { icon: CalendarPlus, tone: "text-success bg-success-soft", title: "Nová rezervace", text: `${who} · ${when}`, booking: p.booking_id as string };
    case "staff_booking_pending":
      return { icon: Clock, tone: "text-warning bg-warning-soft", title: "Rezervace čeká na potvrzení", text: `${who} · ${when}`, booking: p.booking_id as string };
    case "staff_booking_cancelled":
      return { icon: CalendarX, tone: "text-danger bg-danger-soft", title: "Klient zrušil rezervaci", text: `${who} · ${when}`, booking: p.booking_id as string };
    case "staff_booking_moved":
      return { icon: CalendarPlus, tone: "text-info bg-info-soft", title: "Klient přesunul rezervaci", text: `${who} · ${when}`, booking: p.booking_id as string };
    default:
      return { icon: BellRing, tone: "text-accent bg-accent-soft", title: "Upozornění", text: row.type, booking: undefined };
  }
}

export function NotificationBell() {
  const { salon, userId } = useSalon();
  const router = useRouter();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);

  const query = useQuery({
    queryKey: ["notifications", userId, salon.id],
    refetchInterval: 45_000,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("notifications")
        .select("id,type,payload,created_at,read_at")
        .eq("channel", "in_app")
        .eq("salon_id", salon.id)
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return (data ?? []) as unknown as NotificationRow[];
    },
  });

  const markRead = useMutation({
    mutationFn: async () => {
      const { error } = await getSupabase().rpc("mark_notifications_read", {});
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unread = (query.data ?? []).filter((row) => !row.read_at).length;

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      className="w-[min(24rem,calc(100vw-24px))] p-0"
      trigger={
        <Button variant="ghost" size="icon" className="relative" aria-label="Upozornění">
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-3 px-1 text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      }
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="font-semibold">Upozornění</p>
        {unread > 0 && (
          <button type="button" onClick={() => markRead.mutate()} className="text-xs font-medium text-accent">
            Označit vše jako přečtené
          </button>
        )}
      </div>
      <div className="ui-scroll max-h-[26rem] overflow-y-auto">
        {(query.data ?? []).length === 0 ? (
          <EmptyState icon={Bell} compact title="Zatím nic nového" description="Nové rezervace a důležité události se ukážou tady." />
        ) : (
          (query.data ?? []).map((row) => {
            const view = describe(row, salon.timezone);
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (view.booking) router.push(`/app/${salon.slug}/kalendar?rezervace=${view.booking}`);
                }}
                className={cn("flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2", !row.read_at && "bg-accent-soft/40")}
              >
                <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md", view.tone)}>
                  <view.icon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{view.title}</span>
                  <span className="block truncate text-sm text-fg-muted">{view.text}</span>
                  <span className="mt-0.5 block text-xs text-fg-subtle">{formatDateTime(row.created_at, salon.timezone)}</span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </Popover>
  );
}
