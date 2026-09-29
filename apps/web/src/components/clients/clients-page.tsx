"use client";

import { Avatar, Badge, Button, EmptyState, Input, Select, Stagger, StaggerItem, useDebounced, cn } from "@repo/ui";
import { Download, Repeat, Search, UserPlus, Users, UserCheck, UserX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { useSalon } from "@/components/app/salon-context";
import { StatCard } from "@/components/app/stat-card";
import { DataTable, type Column } from "@/components/app/data-table";
import { czk, formatPhone } from "@/lib/format";
import { downloadCsv, halereToCsv } from "@/lib/csv";
import { useClients, useStaff, type ClientListRow } from "@/lib/data";
import { formatDate } from "@/lib/time";
import { ClientFormDialog } from "./client-form";

const segments = [
  { id: "all", label: "Všichni" },
  { id: "due", label: "Čas na návštěvu" },
  { id: "regular", label: "Pravidelní" },
  { id: "new", label: "Noví" },
  { id: "lapsed", label: "Dlouho nepřišli" },
  { id: "noshow", label: "Nedorazili" },
];

function daysSince(iso: string | null): number | null {
  return iso ? Math.floor((Date.now() - Date.parse(iso)) / 86400000) : null;
}

export function ClientsPage() {
  const { salon, can } = useSalon();
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [segment, setSegment] = useState("all");
  const [sort, setSort] = useState("name");
  const [formOpen, setFormOpen] = useState(false);
  const debounced = useDebounced(term, 250);
  const query = useClients(debounced, 300);
  const staff = useStaff(true);
  const staffMap = new Map((staff.data ?? []).map((s) => [s.id, s.display_name]));
  const isMgmt = can(["owner", "manager"]);

  const rows = useMemo(() => {
    const list = (query.data ?? []).filter((client) => {
      const stats = client.stats;
      const since = daysSince(stats?.last_visit_at ?? null);
      switch (segment) {
        case "due":
          return !!stats?.next_expected_at && Date.parse(stats.next_expected_at) < Date.now();
        case "regular":
          return (stats?.visits_count ?? 0) >= 3 && (stats?.avg_interval_days ?? 999) <= 45;
        case "new":
          return (stats?.visits_count ?? 0) <= 1;
        case "lapsed":
          return since !== null && since > 90;
        case "noshow":
          return (stats?.no_show_count ?? 0) > 0;
        default:
          return true;
      }
    });
    const sorted = [...list];
    if (sort === "visits") sorted.sort((a, b) => (b.stats?.visits_count ?? 0) - (a.stats?.visits_count ?? 0));
    if (sort === "spent") sorted.sort((a, b) => (b.stats?.total_spent ?? 0) - (a.stats?.total_spent ?? 0));
    if (sort === "recent") sorted.sort((a, b) => (b.stats?.last_visit_at ?? "").localeCompare(a.stats?.last_visit_at ?? ""));
    return sorted;
  }, [query.data, segment, sort]);

  const all = query.data ?? [];
  const active = all.filter((c) => (daysSince(c.stats?.last_visit_at ?? null) ?? 999) <= 60).length;
  const due = all.filter((c) => c.stats?.next_expected_at && Date.parse(c.stats.next_expected_at) < Date.now()).length;
  const avgVisits = all.length ? all.reduce((sum, c) => sum + (c.stats?.visits_count ?? 0), 0) / all.length : 0;

  const columns: Column<ClientListRow>[] = [
    {
      key: "name",
      header: "Klient",
      cell: (client) => (
        <div className="flex items-center gap-3">
          <Avatar name={client.full_name} size={36} />
          <div className="min-w-0">
            <p className="truncate font-medium">{client.full_name}</p>
            <p className="truncate text-xs text-fg-subtle">{formatPhone(client.phone) || client.email || "Bez kontaktu"}</p>
          </div>
          {client.customer_account_id && <Badge tone="accent" className="hidden xl:inline-flex">Účet</Badge>}
        </div>
      ),
    },
    { key: "visits", header: "Návštěvy", align: "right", cell: (client) => client.stats?.visits_count ?? 0 },
    { key: "spent", header: "Útrata", align: "right", hide: "sm", cell: (client) => czk(client.stats?.total_spent ?? 0) },
    {
      key: "last",
      header: "Poslední návštěva",
      hide: "md",
      cell: (client) => (client.stats?.last_visit_at ? <span>{formatDate(client.stats.last_visit_at, salon.timezone)}</span> : <span className="text-fg-subtle">Zatím žádná</span>),
    },
    {
      key: "rhythm",
      header: "Pravidelnost",
      hide: "lg",
      cell: (client) => {
        const stats = client.stats;
        if (!stats?.avg_interval_days) return <span className="text-fg-subtle">—</span>;
        const overdue = stats.next_expected_at && Date.parse(stats.next_expected_at) < Date.now();
        return (
          <span className={cn("inline-flex items-center gap-1.5", overdue && "text-warning")}>
            <Repeat className="h-3.5 w-3.5" /> každých {Math.round(stats.avg_interval_days)} dní
          </span>
        );
      },
    },
    { key: "fav", header: "Oblíbený pracovník", hide: "xl", cell: (client) => (client.stats?.favorite_staff_id ? staffMap.get(client.stats.favorite_staff_id) : "—") },
    {
      key: "flags",
      header: "",
      align: "right",
      cell: (client) => (
        <div className="flex justify-end gap-1.5">
          {client.stats?.next_expected_at && Date.parse(client.stats.next_expected_at) < Date.now() && <Badge tone="warning">Čas na návštěvu</Badge>}
          {(client.stats?.no_show_count ?? 0) > 0 && <Badge tone="danger">{client.stats!.no_show_count}× nedorazil</Badge>}
        </div>
      ),
    },
  ];

  function exportCsv() {
    downloadCsv("klienti.csv", [
      ["Jméno", "Příjmení", "Telefon", "E-mail", "Datum narození", "Návštěvy", "Útrata (Kč)", "Poslední návštěva"],
      ...rows.map((c) => [c.first_name, c.last_name, c.phone, c.email, c.birthday, c.stats?.visits_count ?? 0, halereToCsv(c.stats?.total_spent ?? 0), c.stats?.last_visit_at?.slice(0, 10) ?? ""]),
    ]);
  }

  return (
    <div>
      <PageHeader
        title="Klienti"
        description="Kompletní historie, útrata a pravidelnost každého klienta na jednom místě."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} leading={<Download className="h-4 w-4" />}>
              Export
            </Button>
            <Button onClick={() => setFormOpen(true)} leading={<UserPlus className="h-4 w-4" />}>
              Nový klient
            </Button>
          </>
        }
      />

      <Stagger className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StaggerItem>
          <StatCard icon={Users} label="Klientů celkem" value={all.length} tone="accent" />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={UserCheck} label="Aktivních (60 dní)" value={active} tone="success" />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={Repeat} label="Čas na návštěvu" value={due} tone="warning" footer="Systém jim pošle pozvánku" />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={UserX} label="Průměr návštěv" value={avgVisits} format={(n) => n.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} tone="info" />
        </StaggerItem>
      </Stagger>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {segments.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSegment(item.id)}
            className={cn("rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all", segment === item.id ? "border-transparent bg-[image:var(--gradient-brand)] text-white shadow-glow" : "border-border bg-surface hover:border-border-strong")}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_14rem]">
        <Input leading={<Search />} placeholder="Hledat podle jména, telefonu nebo e-mailu" value={term} onChange={(event) => setTerm(event.target.value)} />
        <Select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Řazení">
          <option value="name">Řadit podle jména</option>
          <option value="visits">Podle počtu návštěv</option>
          <option value="spent">Podle útraty</option>
          <option value="recent">Podle poslední návštěvy</option>
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        getKey={(row) => row.id}
        loading={query.isLoading}
        onRowClick={(row) => router.push(`/app/${salon.slug}/klienti/${row.id}`)}
        empty={<EmptyState icon={Users} title="Žádní klienti" description="Přidejte prvního klienta nebo počkejte, až se někdo zarezervuje online." action={<Button onClick={() => setFormOpen(true)}>Přidat klienta</Button>} />}
      />
      {isMgmt && rows.length > 0 && (
        <p className="mt-3 text-center text-xs text-fg-subtle">
          Zobrazeno {rows.length} klientů. <Link href={`/app/${salon.slug}/marketing`} className="text-accent">Oslovte je kampaní</Link>.
        </p>
      )}
      <ClientFormDialog open={formOpen} onOpenChange={setFormOpen} onSaved={(id) => router.push(`/app/${salon.slug}/klienti/${id}`)} />
    </div>
  );
}
