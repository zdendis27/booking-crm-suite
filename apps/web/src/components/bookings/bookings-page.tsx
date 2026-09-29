"use client";

import { bookingSource, bookingStatus } from "@repo/copy";
import { Avatar, Badge, Button, DatePicker, EmptyState, Input, Select, addDays, cn, useDebounced, useToast } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ListChecks, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { BookingSheet } from "@/components/calendar/booking-sheet";
import { PageHeader } from "@/components/app/page-header";
import { useSalon } from "@/components/app/salon-context";
import { DataTable, type Column } from "@/components/app/data-table";
import { czk } from "@/lib/format";
import { errorMessage, useSb, useStaff } from "@/lib/data";
import { dayBoundsISO, formatTime, todayLocal, toLocal } from "@/lib/time";

interface Row {
  id: string;
  status: string;
  source: string;
  starts_at: string;
  price_total: number;
  discount_total: number;
  products_total: number;
  primary_staff_id: string | null;
  clients: { id: string; full_name: string; phone: string | null } | null;
  booking_items: { name_snap: string }[];
}

const presets = [
  { id: "today", label: "Dnes" },
  { id: "tomorrow", label: "Zítra" },
  { id: "next7", label: "7 dní dopředu" },
  { id: "past30", label: "Posledních 30 dní" },
  { id: "custom", label: "Vlastní" },
];

export function BookingsPage() {
  const { salon, locationId, locations } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const tz = salon.timezone;
  const today = todayLocal(tz);
  const [preset, setPreset] = useState("next7");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 7));
  const [status, setStatus] = useState(search.get("stav") ?? "");
  const [staffId, setStaffId] = useState("");
  const [scope, setScope] = useState("current");
  const [term, setTerm] = useState("");
  const [limit, setLimit] = useState(50);
  const debounced = useDebounced(term, 300);
  const staff = useStaff();
  const openId = search.get("rezervace");

  function choose(id: string) {
    setPreset(id);
    if (id === "today") {
      setFrom(today);
      setTo(today);
    }
    if (id === "tomorrow") {
      setFrom(addDays(today, 1));
      setTo(addDays(today, 1));
    }
    if (id === "next7") {
      setFrom(today);
      setTo(addDays(today, 7));
    }
    if (id === "past30") {
      setFrom(addDays(today, -30));
      setTo(today);
    }
  }

  const query = useQuery({
    queryKey: ["bookings", "list", salon.id, locationId, scope, from, to, status, staffId, debounced, limit],
    placeholderData: (previous) => previous,
    queryFn: async () => {
      let q = sb
        .from("bookings")
        .select("id,status,source,starts_at,price_total,discount_total,products_total,primary_staff_id, clients!inner(id,full_name,phone), booking_items(name_snap)", { count: "exact" })
        .eq("salon_id", salon.id)
        .gte("starts_at", dayBoundsISO(from, tz).from)
        .lt("starts_at", dayBoundsISO(to, tz).to)
        .order("starts_at", { ascending: from > today })
        .limit(limit);
      if (scope === "current") q = q.eq("location_id", locationId);
      if (status) q = q.eq("status", status);
      if (staffId) q = q.eq("primary_staff_id", staffId);
      if (debounced.trim()) q = q.ilike("clients.full_name", `%${debounced.trim().replace(/[%,()]/g, "")}%`);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as Row[], count: count ?? 0 };
    },
  });

  const confirm = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.rpc("set_booking_status", { p_booking: id, p_status: "confirmed" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rezervace potvrzena");
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["pending-count"] });
    },
    onError: (error) => toast.error("Nepodařilo se potvrdit", errorMessage(error)),
  });

  const staffMap = new Map((staff.data ?? []).map((s) => [s.id, s]));

  function open(id: string | null) {
    const params = new URLSearchParams(search.toString());
    if (id) params.set("rezervace", id);
    else params.delete("rezervace");
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
  }

  const columns: Column<Row>[] = [
    {
      key: "when",
      header: "Termín",
      cell: (row) => {
        const local = toLocal(row.starts_at, tz);
        return (
          <div>
            <p className="font-semibold tabular">{formatTime(row.starts_at, tz)}</p>
            <p className="text-xs text-fg-subtle">
              {Number(local.day.slice(8))}. {Number(local.day.slice(5, 7))}. {local.day.slice(0, 4)}
            </p>
          </div>
        );
      },
    },
    {
      key: "client",
      header: "Klient",
      cell: (row) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={row.clients?.full_name ?? "?"} size={32} />
          <div className="min-w-0">
            <p className="truncate font-medium">{row.clients?.full_name}</p>
            <p className="truncate text-xs text-fg-subtle sm:hidden">{row.booking_items.map((i) => i.name_snap).join(", ")}</p>
          </div>
        </div>
      ),
    },
    { key: "services", header: "Služby", hide: "sm", cell: (row) => <span className="line-clamp-2 text-fg-muted">{row.booking_items.map((i) => i.name_snap).join(", ")}</span> },
    {
      key: "staff",
      header: "Pracovník",
      hide: "md",
      cell: (row) => {
        const s = row.primary_staff_id ? staffMap.get(row.primary_staff_id) : null;
        return s ? (
          <span className="inline-flex items-center gap-2">
            <Avatar name={s.display_name} color={s.color} size={22} /> {s.display_name}
          </span>
        ) : (
          "—"
        );
      },
    },
    { key: "source", header: "Zdroj", hide: "lg", cell: (row) => <span className="text-fg-muted">{bookingSource[row.source]}</span> },
    { key: "price", header: "Cena", align: "right", hide: "sm", cell: (row) => czk(row.price_total + row.products_total - row.discount_total) },
    {
      key: "status",
      header: "Stav",
      cell: (row) => {
        const item = bookingStatus[row.status];
        return (
          <div className="flex items-center justify-end gap-2">
            {row.status === "pending" && (
              <Button
                size="xs"
                variant="soft"
                onClick={(event) => {
                  event.stopPropagation();
                  confirm.mutate(row.id);
                }}
                leading={<Check className="h-3.5 w-3.5" />}
              >
                Potvrdit
              </Button>
            )}
            {item && <Badge tone={item.tone}>{item.label}</Badge>}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader title="Rezervace" description="Přehled všech rezervací s filtrováním a rychlým potvrzením." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {presets.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => choose(item.id)}
            className={cn("rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all", preset === item.id ? "border-transparent bg-[image:var(--gradient-brand)] text-white shadow-glow" : "border-border bg-surface hover:border-border-strong")}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
        <Input leading={<Search />} placeholder="Hledat klienta" value={term} onChange={(event) => setTerm(event.target.value)} />
        <Select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Všechny stavy</option>
          {Object.entries(bookingStatus).map(([value, item]) => (
            <option key={value} value={value}>
              {item.label}
            </option>
          ))}
        </Select>
        <Select value={staffId} onChange={(event) => setStaffId(event.target.value)}>
          <option value="">Všichni pracovníci</option>
          {(staff.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.display_name}
            </option>
          ))}
        </Select>
        {locations.length > 1 ? (
          <Select value={scope} onChange={(event) => setScope(event.target.value)}>
            <option value="current">Vybraná pobočka</option>
            <option value="all">Všechny pobočky</option>
          </Select>
        ) : (
          <div />
        )}
        {preset === "custom" && (
          <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-1">
            <DatePicker value={from} onChange={setFrom} size="sm" />
            <span className="text-fg-subtle">–</span>
            <DatePicker value={to} onChange={setTo} size="sm" />
          </div>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={query.data?.rows ?? []}
        getKey={(row) => row.id}
        loading={query.isLoading}
        onRowClick={(row) => open(row.id)}
        empty={<EmptyState icon={ListChecks} title="Žádné rezervace" description="Pro zvolený filtr tu nic není. Zkuste změnit období nebo stav." />}
      />

      {query.data && query.data.count > (query.data.rows.length ?? 0) && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={() => setLimit(limit + 50)}>
            Načíst další ({query.data.count - query.data.rows.length})
          </Button>
        </div>
      )}
      {query.data && <p className="mt-3 text-center text-xs text-fg-subtle">Zobrazeno {query.data.rows.length} z {query.data.count}</p>}

      <BookingSheet bookingId={openId} onClose={() => open(null)} />
    </div>
  );
}
