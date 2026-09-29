"use client";

import { invoiceKind, invoiceStatus } from "@repo/copy";
import { Badge, Button, Dialog, EmptyState, Field, Input, Menu, Stagger, StaggerItem, Tabs, Textarea, cn, useToast } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Banknote, Building2, CheckCircle2, Download, FileSpreadsheet, FileText, Landmark, Loader2, MoreHorizontal, Plus, Receipt, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FeatureGate } from "@/components/app/feature-gate";
import { PageHeader } from "@/components/app/page-header";
import { useSalon } from "@/components/app/salon-context";
import { StatCard } from "@/components/app/stat-card";
import { DataTable, type Column } from "@/components/app/data-table";
import { ClientPicker } from "@/components/clients/client-picker";
import { downloadCsv, halereToCsv } from "@/lib/csv";
import { czk } from "@/lib/format";
import { errorMessage, useSb, type ClientListRow } from "@/lib/data";
import { todayLocal } from "@/lib/time";

interface InvoiceRow {
  id: string;
  kind: string;
  status: string;
  number: string | null;
  customer_name: string;
  issue_date: string | null;
  due_date: string | null;
  total_gross: number;
  advance_paid: number;
  paid_amount: number;
  sent_at: string | null;
}

type Filter = "all" | "draft" | "open" | "overdue" | "paid";

export function InvoicesPage() {
  return (
    <FeatureGate feature="invoicing">
      <InvoicesContent />
    </FeatureGate>
  );
}

function InvoicesContent() {
  const { salon } = useSalon();
  const sb = useSb();
  const router = useRouter();
  const today = todayLocal(salon.timezone);
  const [filter, setFilter] = useState<Filter>("all");
  const [term, setTerm] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const query = useQuery({
    queryKey: ["invoices", salon.id],
    queryFn: async () => {
      const { data, error } = await sb.from("invoices").select("id,kind,status,number,customer_name,issue_date,due_date,total_gross,advance_paid,paid_amount,sent_at").eq("salon_id", salon.id).order("created_at", { ascending: false }).limit(400);
      if (error) throw error;
      return (data ?? []) as InvoiceRow[];
    },
  });

  const rows = query.data ?? [];
  const balance = (r: InvoiceRow) => r.total_gross - r.advance_paid - r.paid_amount;
  const isOpen = (r: InvoiceRow) => r.kind !== "credit_note" && ["issued", "partially_paid"].includes(r.status);
  const isOverdue = (r: InvoiceRow) => isOpen(r) && !!r.due_date && r.due_date < today;
  const outstanding = rows.filter(isOpen).reduce((sum, r) => sum + balance(r), 0);
  const overdue = rows.filter(isOverdue).reduce((sum, r) => sum + balance(r), 0);
  const monthKey = today.slice(0, 7);
  const issuedMonth = rows.filter((r) => r.kind === "invoice" && r.issue_date?.startsWith(monthKey) && r.status !== "draft").reduce((sum, r) => sum + r.total_gross, 0);
  const paidMonth = rows.filter((r) => r.kind === "invoice" && r.status === "paid" && r.issue_date?.startsWith(monthKey)).reduce((sum, r) => sum + r.total_gross, 0);

  const shown = rows.filter((r) => {
    if (filter === "draft" && r.status !== "draft") return false;
    if (filter === "open" && !isOpen(r)) return false;
    if (filter === "overdue" && !isOverdue(r)) return false;
    if (filter === "paid" && r.status !== "paid") return false;
    if (term.trim() && !`${r.number ?? ""} ${r.customer_name}`.toLowerCase().includes(term.trim().toLowerCase())) return false;
    return true;
  });

  const columns: Column<InvoiceRow>[] = [
    { key: "number", header: "Číslo", cell: (r) => <span className="font-semibold tabular">{r.number ?? "Koncept"}</span> },
    { key: "kind", header: "Druh", hide: "md", cell: (r) => <span className="text-fg-muted">{invoiceKind[r.kind]}</span> },
    { key: "customer", header: "Odběratel", cell: (r) => <span className="line-clamp-1 font-medium">{r.customer_name}</span> },
    { key: "issued", header: "Vystaveno", hide: "sm", cell: (r) => (r.issue_date ? new Date(r.issue_date).toLocaleDateString("cs-CZ") : "—") },
    {
      key: "due",
      header: "Splatnost",
      hide: "md",
      cell: (r) => (r.due_date ? <span className={cn(isOverdue(r) && "font-semibold text-danger")}>{new Date(r.due_date).toLocaleDateString("cs-CZ")}</span> : "—"),
    },
    { key: "amount", header: "Částka", align: "right", cell: (r) => <span className="font-semibold">{r.status === "draft" && r.total_gross === 0 ? "—" : czk(r.total_gross)}</span> },
    {
      key: "status",
      header: "Stav",
      cell: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          {isOverdue(r) ? <Badge tone="danger" dot>Po splatnosti</Badge> : <Badge tone={invoiceStatus[r.status]?.tone}>{invoiceStatus[r.status]?.label}</Badge>}
          {r.sent_at && <span title="Odesláno e-mailem" className="hidden text-fg-subtle lg:inline">✉</span>}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Fakturace"
        description="České faktury, zálohové faktury a dobropisy s QR platbou, číslováním bez mezer a exportem pro účetní."
        actions={
          <>
            <Menu
              trigger={
                <Button variant="secondary" size="icon" aria-label="Další akce">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              }
              items={[
                { label: "Import plateb z banky", icon: <Landmark />, onSelect: () => setImportOpen(true) },
                { label: "Export pro účetní", icon: <FileSpreadsheet />, onSelect: () => setExportOpen(true) },
                { separator: true, label: "" },
                { label: "Fakturační údaje a řady", icon: <Building2 />, onSelect: () => router.push(`/app/${salon.slug}/nastaveni/fakturace`) },
              ]}
            />
            <Button size="lg" onClick={() => setNewOpen(true)} leading={<Plus className="h-[18px] w-[18px]" />}>
              Nová faktura
            </Button>
          </>
        }
      />

      <Stagger className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StaggerItem>
          <StatCard icon={Banknote} label="K úhradě" value={outstanding / 100} format={(n) => czk(Math.round(n * 100))} tone="accent" loading={query.isLoading} />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={AlertTriangle} label="Po splatnosti" value={overdue / 100} format={(n) => czk(Math.round(n * 100))} tone="danger" loading={query.isLoading} />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={Receipt} label="Vystaveno tento měsíc" value={issuedMonth / 100} format={(n) => czk(Math.round(n * 100))} tone="info" loading={query.isLoading} />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={CheckCircle2} label="Uhrazeno tento měsíc" value={paidMonth / 100} format={(n) => czk(Math.round(n * 100))} tone="success" loading={query.isLoading} />
        </StaggerItem>
      </Stagger>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          variant="pill"
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: "all", label: "Vše", count: rows.length },
            { value: "draft", label: "Koncepty", count: rows.filter((r) => r.status === "draft").length },
            { value: "open", label: "Neuhrazené", count: rows.filter(isOpen).length },
            { value: "overdue", label: "Po splatnosti", count: rows.filter(isOverdue).length },
            { value: "paid", label: "Uhrazené" },
          ]}
        />
        <div className="w-full sm:w-64">
          <Input leading={<Search />} placeholder="Hledat číslo nebo odběratele" value={term} onChange={(event) => setTerm(event.target.value)} />
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={shown}
        getKey={(r) => r.id}
        loading={query.isLoading}
        onRowClick={(r) => router.push(`/app/${salon.slug}/faktury/${r.id}`)}
        empty={<EmptyState icon={FileText} title="Žádné faktury" description="Vystavte první fakturu nebo ji vytvořte přímo z rezervace." action={<Button onClick={() => setNewOpen(true)}>Nová faktura</Button>} />}
      />

      <NewInvoiceDialog open={newOpen} onOpenChange={setNewOpen} />
      <BankImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
    </div>
  );
}

function NewInvoiceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { salon } = useSalon();
  const sb = useSb();
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind] = useState("invoice");
  const [source, setSource] = useState<"company" | "client">("company");
  const [client, setClient] = useState<ClientListRow | null>(null);
  const [ico, setIco] = useState("");
  const [name, setName] = useState("");
  const [dic, setDic] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [email, setEmail] = useState("");
  const [looking, setLooking] = useState(false);

  async function lookup() {
    setLooking(true);
    try {
      const response = await fetch(`/api/ares?ico=${ico.replace(/\s/g, "")}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setName(data.name);
      setDic(data.dic);
      setStreet(data.street);
      setCity(data.city);
      setZip(data.zip);
      toast.success("Údaje načteny z ARES");
    } catch (error) {
      toast.error("Načtení z ARES se nezdařilo", (error as Error).message);
    } finally {
      setLooking(false);
    }
  }

  const create = useMutation({
    mutationFn: async () => {
      const customer = source === "client" && client ? { name: client.full_name, email: client.email } : { name, ico: ico.replace(/\s/g, ""), dic, street, city, zip, email };
      const { data, error } = await sb.rpc("create_invoice", {
        p_salon: salon.id,
        p_kind: kind,
        p_customer: customer,
        p_items: [{ description: "Položka", quantity: 1, unit: "ks", unit_price: 0, vat_rate: 0 }],
        p_client: source === "client" && client ? client.id : null,
        p_booking: null,
        p_note: null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (id) => {
      onOpenChange(false);
      router.push(`/app/${salon.slug}/faktury/${id}`);
    },
    onError: (error) => toast.error("Fakturu se nepodařilo vytvořit", errorMessage(error)),
  });

  const ready = source === "client" ? !!client : name.trim().length > 1;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nová faktura"
      description="Vyberte druh dokladu a odběratele. Položky doplníte v dalším kroku."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Zrušit
          </Button>
          <Button loading={create.isPending} disabled={!ready} onClick={() => create.mutate()}>
            Pokračovat
          </Button>
        </>
      }
    >
      <div className="grid gap-5 pb-2">
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: "invoice", label: "Faktura", hint: "Daňový doklad" },
            { value: "proforma", label: "Zálohová faktura", hint: "Výzva k platbě" },
          ].map((item) => (
            <button key={item.value} type="button" onClick={() => setKind(item.value)} className={cn("rounded-md border p-3 text-left transition-all", kind === item.value ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong")}>
              <p className="font-semibold">{item.label}</p>
              <p className="text-xs text-fg-muted">{item.hint}</p>
            </button>
          ))}
        </div>
        <Tabs variant="pill" value={source} onChange={setSource} tabs={[{ value: "company", label: "Firma nebo osoba" }, { value: "client", label: "Klient ze systému" }]} />
        {source === "client" ? (
          <ClientPicker value={client} onChange={setClient} />
        ) : (
          <div className="grid gap-4">
            <Field label="IČO" hint="Údaje se doplní z registru ARES">
              <div className="flex gap-2">
                <Input value={ico} onChange={(event) => setIco(event.target.value)} inputMode="numeric" placeholder="12345678" />
                <Button variant="secondary" onClick={lookup} disabled={ico.replace(/\s/g, "").length !== 8 || looking} leading={looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}>
                  ARES
                </Button>
              </div>
            </Field>
            <Field label="Název / jméno" required>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="DIČ">
                <Input value={dic} onChange={(event) => setDic(event.target.value)} />
              </Field>
              <Field label="E-mail">
                <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </Field>
            </div>
            <Field label="Ulice">
              <Input value={street} onChange={(event) => setStreet(event.target.value)} />
            </Field>
            <div className="grid grid-cols-[1fr_8rem] gap-3">
              <Field label="Město">
                <Input value={city} onChange={(event) => setCity(event.target.value)} />
              </Field>
              <Field label="PSČ">
                <Input value={zip} onChange={(event) => setZip(event.target.value)} />
              </Field>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function parseAmount(value: string): number {
  const cleaned = value.replace(/\s/g, "").replace(/[^\d,.\-]/g, "");
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  return Number(normalized);
}

function parseDate(value: string): string {
  const m = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/.exec(value.trim());
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return value.trim().slice(0, 10);
}

function BankImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { salon } = useSalon();
  const sb = useSb();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [results, setResults] = useState<{ vs: string; amount: number; matched: boolean; date: string }[] | null>(null);

  const run = useMutation({
    mutationFn: async () => {
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const delimiter = lines[0]?.includes(";") ? ";" : lines[0]?.includes("\t") ? "\t" : ",";
      const split = (line: string) => line.split(delimiter).map((cell) => cell.replace(/^"|"$/g, "").trim());
      const header = split(lines[0] ?? "").map((h) => h.toLowerCase());
      const find = (...names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
      const iDate = find("datum");
      const iAmount = find("objem", "částka", "castka", "amount");
      const iVs = find("vs", "variabil");
      const iId = find("id pohybu", "id transakce", "reference");
      if (iAmount < 0 || iVs < 0) throw new Error("V souboru nenacházím sloupce s částkou a variabilním symbolem.");
      const out: { vs: string; amount: number; matched: boolean; date: string }[] = [];
      for (const [index, line] of lines.slice(1).entries()) {
        const cells = split(line);
        const amount = Math.round(parseAmount(cells[iAmount] ?? "") * 100);
        const vs = (cells[iVs] ?? "").replace(/\D/g, "");
        if (!vs || !(amount > 0)) continue;
        const date = iDate >= 0 ? parseDate(cells[iDate] ?? "") : new Date().toISOString().slice(0, 10);
        const ref = iId >= 0 ? cells[iId] : `${vs}-${amount}-${date}-${index}`;
        const { data, error } = await sb.rpc("match_bank_payment", { p_salon: salon.id, p_variable_symbol: vs, p_amount: amount, p_date: date, p_ref: ref });
        if (error) throw error;
        out.push({ vs, amount, matched: !!data, date });
      }
      return out;
    },
    onSuccess: (out) => {
      setResults(out);
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value);
        if (!value) setResults(null);
      }}
      size="lg"
      title="Import plateb z banky"
      description="Vložte export z internetového bankovnictví (CSV). Platby se spárují podle variabilního symbolu a částky."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Zavřít
          </Button>
          <Button loading={run.isPending} disabled={!text.trim()} onClick={() => run.mutate()} leading={<Landmark className="h-4 w-4" />}>
            Spárovat platby
          </Button>
        </>
      }
    >
      <div className="grid gap-4 pb-2">
        <Textarea rows={7} value={text} onChange={(event) => setText(event.target.value)} placeholder={"Datum;Objem;VS;ID pohybu\n15.10.2026;1 250,00;20260012;9001"} className="font-mono text-xs" />
        <p className="text-xs text-fg-muted">Podporované jsou exporty s hlavičkou (např. Fio, ČSOB, KB, Air Bank). Duplicitní pohyby se ignorují.</p>
        {run.isError && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{(run.error as Error).message}</p>}
        {results && (
          <div className="overflow-hidden rounded-md border border-border">
            <div className="flex items-center justify-between bg-surface-2 px-4 py-2.5 text-sm font-medium">
              <span>Spárováno {results.filter((r) => r.matched).length} z {results.length}</span>
            </div>
            <ul className="max-h-56 divide-y divide-border overflow-y-auto">
              {results.map((r, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span className="tabular text-fg-muted">VS {r.vs}</span>
                  <span className="flex-1 font-medium tabular">{czk(r.amount)}</span>
                  <Badge tone={r.matched ? "success" : "warning"}>{r.matched ? "Spárováno" : "Nespárováno"}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function ExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { salon } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const today = todayLocal(salon.timezone);
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);

  const run = useMutation({
    mutationFn: async () => {
      const { data, error } = await sb.rpc("export_invoices", { p_salon: salon.id, p_from: from, p_to: to });
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const rate = (row: any, r: number) => (row.vat_summary as any[]).find((v) => Number(v.rate) === r);
      downloadCsv(`faktury-${from}-${to}.csv`, [
        ["Číslo", "Druh", "Stav", "Vystaveno", "DUZP", "Splatnost", "Odběratel", "IČO", "DIČ", "Variabilní symbol", "Základ 21 %", "DPH 21 %", "Základ 12 %", "DPH 12 %", "Základ 0 %", "Celkem základ", "Celkem DPH", "Celkem", "Uhrazeno"],
        ...rows.map((r) => [r.number, invoiceKind[r.kind], invoiceStatus[r.status]?.label, r.issue_date, r.taxable_supply_date, r.due_date, r.customer_name, r.customer_ico, r.customer_dic, r.variable_symbol, halereToCsv(rate(r, 21)?.base ?? 0), halereToCsv(rate(r, 21)?.vat ?? 0), halereToCsv(rate(r, 12)?.base ?? 0), halereToCsv(rate(r, 12)?.vat ?? 0), halereToCsv(rate(r, 0)?.base ?? 0), halereToCsv(r.total_net), halereToCsv(r.total_vat), halereToCsv(r.total_gross), halereToCsv(r.paid_amount)]),
      ]);
      return rows.length;
    },
    onSuccess: (count) => {
      toast.success(`Exportováno ${count} dokladů`);
      onOpenChange(false);
    },
    onError: (error) => toast.error("Export se nepodařil", errorMessage(error)),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Export pro účetní"
      description="CSV se všemi vystavenými doklady za zvolené období včetně rozpadu DPH podle sazeb."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Zrušit
          </Button>
          <Button loading={run.isPending} onClick={() => run.mutate()} leading={<Download className="h-4 w-4" />}>
            Stáhnout CSV
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 pb-2">
        <Field label="Od">
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field label="Do">
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

