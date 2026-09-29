"use client";

import { bookingStatus, invoiceStatus, paymentMethod } from "@repo/copy";
import { AnimatedNumber, Avatar, Badge, Button, Card, CardHeader, Dialog, EmptyState, Field, Input, Menu, Skeleton, Switch, Tabs, Textarea, cn, useToast } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ArrowLeft, CalendarPlus, CircleDollarSign, Gift, Link2, Mail, MoreHorizontal, Pencil, Phone, Pin, Plus, Receipt, Repeat, Star, StickyNote, Trash2, Merge, ShieldOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { BookingForm } from "@/components/calendar/booking-form";
import { BookingSheet } from "@/components/calendar/booking-sheet";
import { useSalon } from "@/components/app/salon-context";
import { ClientPicker } from "./client-picker";
import { ClientFormDialog } from "./client-form";
import { czk, formatPhone } from "@/lib/format";
import { errorMessage, useSb, useStaff, useServices, type ClientListRow } from "@/lib/data";
import { formatDate, formatDateTime, formatTime } from "@/lib/time";

type Tab = "history" | "notes" | "loyalty" | "money" | "consents";

interface ClientFull {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  created_at: string;
  customer_account_id: string | null;
  source: string;
  stats: {
    visits_count: number;
    total_spent: number;
    last_visit_at: string | null;
    first_visit_at: string | null;
    avg_interval_days: number | null;
    next_expected_at: string | null;
    no_show_count: number;
    cancelled_count: number;
    favorite_staff_id: string | null;
    favorite_service_id: string | null;
  } | null;
}

export function ClientDetail({ clientId }: { clientId: string }) {
  const { salon, can, hasFeature } = useSalon();
  const sb = useSb();
  const router = useRouter();
  const search = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("history");
  const [editOpen, setEditOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [anonOpen, setAnonOpen] = useState(false);
  const [openBooking, setOpenBooking] = useState<string | null>(search.get("rezervace"));
  const isMgmt = can(["owner", "manager"]);
  const staff = useStaff(true);
  const services = useServices(true);
  const staffMap = new Map((staff.data ?? []).map((s) => [s.id, s]));
  const serviceMap = new Map((services.data?.services ?? []).map((s) => [s.id, s]));

  const client = useQuery({
    queryKey: ["client", clientId],
    queryFn: async () => {
      const { data, error } = await sb.from("clients").select("*, stats:client_stats(*)").eq("id", clientId).single();
      if (error) throw error;
      const row = data as any;
      return { ...row, stats: Array.isArray(row.stats) ? (row.stats[0] ?? null) : row.stats } as ClientFull;
    },
  });

  const history = useQuery({
    queryKey: ["client", clientId, "history"],
    queryFn: async () => {
      const { data } = await sb.from("bookings").select("id,status,starts_at,price_total,discount_total,products_total,primary_staff_id, booking_items(name_snap)").eq("client_id", clientId).order("starts_at", { ascending: false }).limit(150);
      return (data ?? []) as any[];
    },
  });

  const notes = useQuery({
    queryKey: ["client", clientId, "notes"],
    queryFn: async () => {
      const { data } = await sb.from("client_notes").select("id,body,pinned,created_at").eq("client_id", clientId).order("pinned", { ascending: false }).order("created_at", { ascending: false });
      return (data ?? []) as { id: string; body: string; pinned: boolean; created_at: string }[];
    },
  });

  const consents = useQuery({
    queryKey: ["client", clientId, "consents"],
    queryFn: async () => {
      const { data } = await sb.from("client_consents").select("id,type,granted_at,revoked_at").eq("client_id", clientId).order("granted_at", { ascending: false });
      return (data ?? []) as { id: string; type: string; granted_at: string; revoked_at: string | null }[];
    },
  });

  const loyalty = useQuery({
    queryKey: ["client", clientId, "loyalty"],
    enabled: hasFeature("loyalty"),
    queryFn: async () => {
      const { data: program } = await sb.from("loyalty_programs").select("id,threshold,reward_type,reward_value,reward_service_id,name").eq("salon_id", salon.id).eq("active", true).maybeSingle();
      if (!program) return null;
      const [stamps, rewards, events] = await Promise.all([
        sb.rpc("loyalty_stamp_count", { p_client: clientId, p_program: (program as any).id }),
        sb.from("loyalty_rewards").select("id,status,earned_at,redeemed_at,expires_at").eq("client_id", clientId).order("earned_at", { ascending: false }),
        sb.from("loyalty_events").select("id,type,delta,reason,created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(15),
      ]);
      return { program: program as any, stamps: (stamps.data as number) ?? 0, rewards: (rewards.data ?? []) as any[], events: (events.data ?? []) as any[] };
    },
  });

  const money = useQuery({
    queryKey: ["client", clientId, "money"],
    queryFn: async () => {
      const [payments, invoices] = await Promise.all([
        sb.from("payments").select("id,kind,method,amount,paid_at,booking_id").eq("client_id", clientId).eq("status", "succeeded").order("paid_at", { ascending: false }).limit(60),
        hasFeature("invoicing") ? sb.from("invoices").select("id,number,kind,status,issue_date,total_gross").eq("client_id", clientId).order("created_at", { ascending: false }).limit(30) : Promise.resolve({ data: [] }),
      ]);
      return { payments: (payments.data ?? []) as any[], invoices: (invoices.data ?? []) as any[] };
    },
  });

  const [noteText, setNoteText] = useState("");
  const addNote = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("client_notes").insert({ salon_id: salon.id, client_id: clientId, body: noteText.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setNoteText("");
      qc.invalidateQueries({ queryKey: ["client", clientId, "notes"] });
    },
    onError: (error) => toast.error("Poznámku se nepodařilo uložit", errorMessage(error)),
  });
  const notePin = useMutation({
    mutationFn: async (note: { id: string; pinned: boolean }) => {
      const { error } = await sb.from("client_notes").update({ pinned: !note.pinned }).eq("id", note.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client", clientId, "notes"] }),
  });
  const noteDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("client_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client", clientId, "notes"] }),
  });

  const consentToggle = useMutation({
    mutationFn: async (arg: { type: string; on: boolean }) => {
      if (arg.on) {
        const { error } = await sb.rpc("grant_consent", { p_client: clientId, p_type: arg.type, p_source: "admin" });
        if (error) throw error;
      } else {
        const { error } = await sb.from("client_consents").update({ revoked_at: new Date().toISOString() }).eq("client_id", clientId).eq("type", arg.type).is("revoked_at", null);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client", clientId, "consents"] }),
    onError: (error) => toast.error("Souhlas se nepodařilo změnit", errorMessage(error)),
  });

  if (client.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }
  if (!client.data) {
    return <EmptyState icon={Mail} title="Klient nenalezen" action={<Button asChild><Link href={`/app/${salon.slug}/klienti`}>Zpět na klienty</Link></Button>} />;
  }
  const c = client.data;
  const stats = c.stats;
  const avg = stats && stats.visits_count > 0 ? stats.total_spent / stats.visits_count : 0;
  const due = stats?.next_expected_at && Date.parse(stats.next_expected_at) < Date.now();
  const activeConsent = (type: string) => (consents.data ?? []).some((row) => row.type === type && !row.revoked_at);
  const vip = (stats?.total_spent ?? 0) >= 1_000_000 && (stats?.visits_count ?? 0) >= 10;

  const clientRow: ClientListRow = { ...c, stats: null } as unknown as ClientListRow;

  return (
    <div>
      <Link href={`/app/${salon.slug}/klienti`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Všichni klienti
      </Link>

      <Card className="relative mb-6 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 opacity-70 [background:var(--gradient-mesh)]" />
        <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
          <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }}>
            <Avatar name={c.full_name} size={84} />
          </motion.div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{c.full_name}</h1>
              {vip && <Badge tone="pink"><Star className="h-3 w-3" /> VIP klient</Badge>}
              {due && <Badge tone="warning"><Repeat className="h-3 w-3" /> Čas na návštěvu</Badge>}
              {c.customer_account_id && <Badge tone="accent"><Link2 className="h-3 w-3" /> Má účet</Badge>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-fg-muted">
              {c.phone && (
                <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 hover:text-accent">
                  <Phone className="h-4 w-4" /> {formatPhone(c.phone)}
                </a>
              )}
              {c.email && (
                <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 hover:text-accent">
                  <Mail className="h-4 w-4" /> {c.email}
                </a>
              )}
              <span>Klientem od {formatDate(c.created_at, salon.timezone)}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setBookOpen(true)} leading={<CalendarPlus className="h-4 w-4" />}>
              Nová rezervace
            </Button>
            <Button variant="secondary" size="icon" onClick={() => setEditOpen(true)} aria-label="Upravit">
              <Pencil className="h-4 w-4" />
            </Button>
            {isMgmt && (
              <Menu
                trigger={
                  <Button variant="secondary" size="icon" aria-label="Další akce">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                }
                items={[
                  { label: "Sloučit s jiným klientem", icon: <Merge />, onSelect: () => setMergeOpen(true) },
                  { label: "Anonymizovat (GDPR)", icon: <ShieldOff />, onSelect: () => setAnonOpen(true), danger: true },
                ]}
              />
            )}
          </div>
        </div>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Návštěvy", value: <AnimatedNumber value={stats?.visits_count ?? 0} /> },
          { label: "Útrata celkem", value: <AnimatedNumber value={(stats?.total_spent ?? 0) / 100} format={(n) => czk(Math.round(n * 100))} /> },
          { label: "Průměr na návštěvu", value: czk(Math.round(avg)) },
          { label: "Chodí každých", value: stats?.avg_interval_days ? `${Math.round(stats.avg_interval_days)} dní` : "—" },
          { label: "Příští očekávaná", value: stats?.next_expected_at ? formatDate(stats.next_expected_at, salon.timezone) : "—", warn: due },
          { label: "Poslední návštěva", value: stats?.last_visit_at ? formatDate(stats.last_visit_at, salon.timezone) : "—" },
        ].map((item) => (
          <Card key={item.label} className="p-4">
            <p className="text-xs text-fg-subtle">{item.label}</p>
            <p className={cn("mt-1 text-lg font-semibold tabular", item.warn && "text-warning")}>{item.value}</p>
          </Card>
        ))}
      </div>

      {stats && (stats.favorite_service_id || stats.favorite_staff_id) && (
        <div className="mb-6 flex flex-wrap gap-2">
          {stats.favorite_service_id && serviceMap.get(stats.favorite_service_id) && <Badge tone="accent">Oblíbená služba: {serviceMap.get(stats.favorite_service_id)!.name}</Badge>}
          {stats.favorite_staff_id && staffMap.get(stats.favorite_staff_id) && <Badge tone="info">Oblíbený pracovník: {staffMap.get(stats.favorite_staff_id)!.display_name}</Badge>}
          {stats.no_show_count > 0 && <Badge tone="danger">{stats.no_show_count}× nedorazil</Badge>}
        </div>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "history", label: "Historie", count: history.data?.length },
          { value: "notes", label: "Poznámky", count: notes.data?.length },
          ...(hasFeature("loyalty") ? [{ value: "loyalty" as Tab, label: "Věrnost" }] : []),
          { value: "money", label: "Platby a faktury" },
          { value: "consents", label: "Souhlasy" },
        ]}
        className="mb-5"
      />

      {tab === "history" && (
        <Card>
          {history.isLoading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : (history.data ?? []).length === 0 ? (
            <EmptyState icon={CalendarPlus} title="Zatím žádná návštěva" action={<Button onClick={() => setBookOpen(true)}>Vytvořit rezervaci</Button>} />
          ) : (
            <ul className="divide-y divide-border">
              {(history.data ?? []).map((row) => {
                const status = bookingStatus[row.status];
                return (
                  <li key={row.id}>
                    <button type="button" onClick={() => setOpenBooking(row.id)} className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-surface-2/70">
                      <div className="w-24 shrink-0">
                        <p className="text-sm font-semibold">{formatDate(row.starts_at, salon.timezone)}</p>
                        <p className="text-xs tabular text-fg-subtle">{formatTime(row.starts_at, salon.timezone)}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{row.booking_items.map((i: any) => i.name_snap).join(", ")}</p>
                        <p className="truncate text-xs text-fg-muted">{row.primary_staff_id ? staffMap.get(row.primary_staff_id)?.display_name : ""}</p>
                      </div>
                      <span className="hidden text-sm tabular sm:block">{czk(row.price_total + row.products_total - row.discount_total)}</span>
                      {status && <Badge tone={status.tone}>{status.label}</Badge>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {tab === "notes" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
          <div className="grid content-start gap-3">
            {(notes.data ?? []).length === 0 && <EmptyState icon={StickyNote} title="Žádné poznámky" description="Zapište si cokoliv, co se hodí při další návštěvě: preference, alergie, domluvy." />}
            {(notes.data ?? []).map((note) => (
              <Card key={note.id} className={cn("p-4", note.pinned && "border-accent/40 bg-accent-soft/40")}>
                <p className="whitespace-pre-wrap text-sm">{note.body}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-fg-subtle">
                  <span>{formatDateTime(note.created_at, salon.timezone)}</span>
                  <span className="flex gap-1">
                    <button type="button" onClick={() => notePin.mutate(note)} className={cn("rounded-sm p-1.5 transition-colors hover:bg-surface-2", note.pinned && "text-accent")} aria-label="Připnout">
                      <Pin className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => noteDelete.mutate(note.id)} className="rounded-sm p-1.5 transition-colors hover:bg-danger-soft hover:text-danger" aria-label="Smazat">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
              </Card>
            ))}
          </div>
          <Card className="h-fit p-4">
            <p className="mb-2 text-sm font-semibold">Nová poznámka</p>
            <Textarea rows={5} value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Např. preferuje kratší boky, alergie na parfémovaná tonika" />
            <Button className="mt-3 w-full" disabled={!noteText.trim()} loading={addNote.isPending} onClick={() => addNote.mutate()} leading={<Plus className="h-4 w-4" />}>
              Přidat poznámku
            </Button>
          </Card>
        </div>
      )}

      {tab === "loyalty" && <LoyaltyPanel clientId={clientId} data={loyalty.data} loading={loyalty.isLoading} isMgmt={isMgmt} />}

      {tab === "money" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Platby" />
            <ul className="divide-y divide-border p-2">
              {(money.data?.payments ?? []).length === 0 && <li className="p-4 text-sm text-fg-muted">Žádné platby.</li>}
              {(money.data?.payments ?? []).map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-2 text-fg-muted">
                    <CircleDollarSign className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-medium">{paymentMethod[p.method]}{p.kind === "tip" ? " · spropitné" : ""}</span>
                    <span className="text-xs text-fg-subtle">{formatDateTime(p.paid_at, salon.timezone)}</span>
                  </span>
                  <span className={cn("font-semibold tabular", p.amount < 0 && "text-danger")}>{czk(p.amount)}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Faktury" />
            <ul className="divide-y divide-border p-2">
              {!hasFeature("invoicing") && <li className="p-4 text-sm text-fg-muted">Fakturace je součástí vyššího tarifu.</li>}
              {hasFeature("invoicing") && (money.data?.invoices ?? []).length === 0 && <li className="p-4 text-sm text-fg-muted">Žádné faktury.</li>}
              {(money.data?.invoices ?? []).map((inv) => (
                <li key={inv.id}>
                  <Link href={`/app/${salon.slug}/faktury/${inv.id}`} className="flex items-center gap-3 rounded-md px-3 py-3 transition-colors hover:bg-surface-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-2 text-fg-muted">
                      <Receipt className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block font-medium">{inv.number ?? "Koncept"}</span>
                      <span className="text-xs text-fg-subtle">{inv.issue_date ? formatDate(inv.issue_date, salon.timezone) : ""}</span>
                    </span>
                    <Badge tone={invoiceStatus[inv.status]?.tone}>{invoiceStatus[inv.status]?.label}</Badge>
                    <span className="font-semibold tabular">{czk(inv.total_gross)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {tab === "consents" && (
        <Card className="max-w-2xl">
          <CardHeader title="Souhlasy s komunikací" description="Provozní zprávy (potvrzení, připomínka termínu) se posílají vždy. Obchodní sdělení podle souhlasu." />
          <div className="divide-y divide-border p-2">
            {[
              { type: "marketing_email", label: "Obchodní sdělení e-mailem", hint: "Připomínky vrácení, kampaně, narozeniny. Stávajícím klientům lze posílat do odhlášení." },
              { type: "marketing_push", label: "Obchodní sdělení přes push", hint: "Vyžaduje výslovný souhlas." },
              { type: "marketing_sms", label: "Obchodní sdělení přes SMS", hint: "Vyžaduje výslovný souhlas." },
            ].map((item) => (
              <div key={item.type} className="flex items-center gap-4 px-3 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-fg-muted">{item.hint}</p>
                </div>
                <Switch checked={activeConsent(item.type)} onCheckedChange={(on) => consentToggle.mutate({ type: item.type, on })} label={item.label} />
              </div>
            ))}
          </div>
        </Card>
      )}

      <ClientFormDialog open={editOpen} onOpenChange={setEditOpen} client={c} />
      <BookingForm open={bookOpen} onOpenChange={setBookOpen} initial={{ client: clientRow }} onCreated={(id) => setOpenBooking(id)} />
      <BookingSheet bookingId={openBooking} onClose={() => setOpenBooking(null)} />
      <MergeDialog open={mergeOpen} onOpenChange={setMergeOpen} keep={c} onDone={() => qc.invalidateQueries()} />
      <AnonymizeDialog open={anonOpen} onOpenChange={setAnonOpen} clientId={clientId} onDone={() => router.push(`/app/${salon.slug}/klienti`)} />
    </div>
  );
}

function LoyaltyPanel({ clientId, data, loading, isMgmt }: { clientId: string; data: any; loading: boolean; isMgmt: boolean }) {
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState("1");
  const [reason, setReason] = useState("");
  const adjust = useMutation({
    mutationFn: async () => {
      const { error } = await sb.rpc("adjust_loyalty_stamps", { p_client: clientId, p_delta: Number(delta), p_reason: reason });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Razítka upravena");
      setOpen(false);
      setReason("");
      qc.invalidateQueries({ queryKey: ["client", clientId, "loyalty"] });
    },
    onError: (error) => toast.error("Úprava se nepodařila", errorMessage(error)),
  });
  if (loading) return <Skeleton className="h-56 rounded-lg" />;
  if (!data) return <EmptyState icon={Gift} title="Věrnostní program není zapnutý" description="Nastavte ho v sekci Věrnost." />;
  const { program, stamps, rewards, events } = data;
  const available = rewards.filter((r: any) => r.status === "available");
  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <Card className="overflow-hidden">
        <div className="bg-[image:var(--gradient-brand)] p-6 text-white">
          <p className="text-sm text-white/80">{program.name}</p>
          <p className="mt-1 text-2xl font-semibold">
            {stamps} / {program.threshold} razítek
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            {Array.from({ length: program.threshold }, (_, index) => (
              <motion.span
                key={index}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: index * 0.05, type: "spring", stiffness: 300, damping: 16 }}
                className={cn("flex h-11 w-11 items-center justify-center rounded-full border-2", index < stamps ? "border-white bg-white text-accent" : "border-white/40")}
              >
                {index < stamps ? <Star className="h-5 w-5 fill-current" /> : <span className="text-sm text-white/60">{index + 1}</span>}
              </motion.span>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between p-4">
          <p className="text-sm text-fg-muted">{available.length > 0 ? `K dispozici ${available.length}× odměna` : `Do další odměny zbývá ${Math.max(0, program.threshold - stamps)} návštěv`}</p>
          {isMgmt && (
            <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
              Upravit razítka
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Poslední události" />
        <ul className="divide-y divide-border p-2">
          {events.length === 0 && <li className="p-4 text-sm text-fg-muted">Zatím nic.</li>}
          {events.map((event: any) => (
            <li key={event.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <span>
                {event.type === "stamp_earned" ? "Razítko přidáno" : event.type === "reward_earned" ? "Odměna získána" : event.type === "reward_redeemed" ? "Odměna uplatněna" : event.type === "manual_adjustment" ? `Ruční úprava ${event.delta > 0 ? "+" : ""}${event.delta}` : event.type}
                {event.reason && <span className="block text-xs text-fg-subtle">{event.reason}</span>}
              </span>
              <span className="text-xs text-fg-subtle">{new Date(event.created_at).toLocaleDateString("cs-CZ")}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Upravit razítka"
        description="Změna se zapíše do historie s důvodem."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Zrušit
            </Button>
            <Button loading={adjust.isPending} disabled={!reason.trim() || !Number(delta)} onClick={() => adjust.mutate()}>
              Uložit
            </Button>
          </>
        }
      >
        <div className="grid gap-4 pb-2">
          <Field label="Počet razítek (záporné číslo odebere)">
            <Input type="number" value={delta} onChange={(event) => setDelta(event.target.value)} />
          </Field>
          <Field label="Důvod" required>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Např. dárek k narozeninám" />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}

function MergeDialog({ open, onOpenChange, keep, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; keep: ClientFull; onDone: () => void }) {
  const sb = useSb();
  const toast = useToast();
  const [other, setOther] = useState<ClientListRow | null>(null);
  const merge = useMutation({
    mutationFn: async () => {
      const { error } = await sb.rpc("merge_clients", { p_keep: keep.id, p_merge: other!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Klienti sloučeni");
      onDone();
      onOpenChange(false);
      setOther(null);
    },
    onError: (error) => toast.error("Sloučení se nepodařilo", errorMessage(error)),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Sloučit klienty"
      description={`Všechny rezervace, poznámky a odměny vybraného klienta se přesunou ke klientovi ${keep.full_name}.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Zrušit
          </Button>
          <Button variant="danger" disabled={!other || other.id === keep.id} loading={merge.isPending} onClick={() => merge.mutate()}>
            Sloučit
          </Button>
        </>
      }
    >
      <div className="pb-2">
        <ClientPicker value={other} onChange={setOther} />
      </div>
    </Dialog>
  );
}

function AnonymizeDialog({ open, onOpenChange, clientId, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; clientId: string; onDone: () => void }) {
  const sb = useSb();
  const toast = useToast();
  const run = useMutation({
    mutationFn: async () => {
      const { error } = await sb.rpc("anonymize_client", { p_client: clientId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Klient anonymizován");
      onDone();
    },
    onError: (error) => toast.error("Anonymizace se nepodařila", errorMessage(error)),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Anonymizovat klienta"
      description="Jméno, telefon, e-mail a poznámky se nenávratně odstraní. Rezervace a tržby zůstanou pro účetnictví zachovány."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Zrušit
          </Button>
          <Button variant="danger" loading={run.isPending} onClick={() => run.mutate()}>
            Anonymizovat
          </Button>
        </>
      }
    >
      <p className="pb-2 text-sm text-fg-muted">Použijte při žádosti klienta o výmaz osobních údajů (GDPR).</p>
    </Dialog>
  );
}
