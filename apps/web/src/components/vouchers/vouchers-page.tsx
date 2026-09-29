"use client";

import { Badge, Button, DatePicker, Dialog, EmptyState, Field, Input, Menu, ProgressBar, Select, Stagger, StaggerItem, Tabs, Textarea, useToast } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Copy, Download, Gift, MoreHorizontal, Plus, ScanLine, Ticket, Wallet } from "lucide-react";
import { useState } from "react";
import { FeatureGate } from "@/components/app/feature-gate";
import { PageHeader } from "@/components/app/page-header";
import { useSalon } from "@/components/app/salon-context";
import { StatCard } from "@/components/app/stat-card";
import { DataTable, type Column } from "@/components/app/data-table";
import { czk } from "@/lib/format";
import { errorMessage, useServices, useSb } from "@/lib/data";

interface Voucher {
  id: string;
  code: string;
  initial_amount: number;
  balance: number;
  service_id: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  message: string | null;
  source: string;
  status: string;
  expires_at: string | null;
  created_at: string;
}

const statusView: Record<string, { label: string; tone: "success" | "neutral" | "warning" | "danger" }> = {
  active: { label: "Aktivní", tone: "success" },
  used: { label: "Vyčerpán", tone: "neutral" },
  expired: { label: "Vypršel", tone: "warning" },
  cancelled: { label: "Zrušen", tone: "danger" },
};

export function VouchersPage() {
  return (
    <FeatureGate feature="vouchers">
      <VouchersContent />
    </FeatureGate>
  );
}

function VouchersContent() {
  const { salon, can } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState("active");
  const [issueOpen, setIssueOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const isMgmt = can(["owner", "manager"]);
  const services = useServices();

  const query = useQuery({
    queryKey: ["vouchers", salon.id],
    queryFn: async () => {
      const { data, error } = await sb.from("vouchers").select("*").eq("salon_id", salon.id).order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return (data ?? []) as Voucher[];
    },
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.rpc("cancel_voucher", { p_voucher: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Poukaz zrušen");
      qc.invalidateQueries({ queryKey: ["vouchers"] });
    },
    onError: (error) => toast.error("Poukaz se nepodařilo zrušit", errorMessage(error)),
  });

  const rows = query.data ?? [];
  const active = rows.filter((v) => v.status === "active");
  const liability = active.reduce((sum, v) => sum + Number(v.balance), 0);
  const sold = rows.reduce((sum, v) => sum + Number(v.initial_amount), 0);
  const redeemed = rows.reduce((sum, v) => sum + (Number(v.initial_amount) - Number(v.balance)), 0);
  const shown = tab === "all" ? rows : tab === "active" ? active : rows.filter((v) => v.status !== "active");
  const serviceName = (id: string | null) => services.data?.services.find((s) => s.id === id)?.name;

  const columns: Column<Voucher>[] = [
    {
      key: "code",
      header: "Kód",
      cell: (v) => (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            navigator.clipboard.writeText(v.code);
            toast.success("Kód zkopírován", v.code);
          }}
          className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold tracking-wide hover:text-accent"
        >
          {v.code} <Copy className="h-3.5 w-3.5 opacity-50" />
        </button>
      ),
    },
    { key: "recipient", header: "Pro", hide: "sm", cell: (v) => v.recipient_name ?? <span className="text-fg-subtle">—</span> },
    { key: "service", header: "Platí na", hide: "md", cell: (v) => serviceName(v.service_id) ?? <span className="text-fg-muted">Libovolnou službu</span> },
    {
      key: "balance",
      header: "Zůstatek",
      cell: (v) => (
        <div className="min-w-32">
          <p className="font-semibold tabular">{czk(v.balance)} <span className="text-xs font-normal text-fg-subtle">z {czk(v.initial_amount)}</span></p>
          <ProgressBar value={(Number(v.balance) / Number(v.initial_amount)) * 100} className="mt-1 h-1" />
        </div>
      ),
    },
    { key: "expires", header: "Platnost", hide: "md", cell: (v) => (v.expires_at ? new Date(v.expires_at).toLocaleDateString("cs-CZ") : "—") },
    { key: "source", header: "Původ", hide: "lg", cell: (v) => <Badge tone={v.source === "online" ? "info" : "neutral"}>{v.source === "online" ? "E-shop" : "Prodejna"}</Badge> },
    { key: "status", header: "Stav", cell: (v) => <Badge tone={statusView[v.status]?.tone} dot>{statusView[v.status]?.label}</Badge> },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (v) => (
        <Menu
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label="Akce" onClick={(event) => event.stopPropagation()}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          }
          items={[
            { label: "Stáhnout PDF poukaz", icon: <Download />, onSelect: () => window.open(`/api/vouchers/${v.id}/pdf`, "_blank") },
            { label: "Kopírovat kód", icon: <Copy />, onSelect: () => navigator.clipboard.writeText(v.code) },
            { separator: true, label: "" },
            { label: "Zrušit poukaz", icon: <Ban />, danger: true, disabled: v.status !== "active" || !isMgmt, onSelect: () => cancel.mutate(v.id) },
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Dárkové poukazy"
        description="Prodej, evidence zůstatků a uplatnění poukazů. Zákazníci si je mohou koupit i online na vaší stránce."
        actions={
          <>
            <Button variant="secondary" onClick={() => setCheckOpen(true)} leading={<ScanLine className="h-4 w-4" />}>
              Ověřit kód
            </Button>
            <Button size="lg" onClick={() => setIssueOpen(true)} leading={<Plus className="h-[18px] w-[18px]" />}>
              Nový poukaz
            </Button>
          </>
        }
      />

      <Stagger className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StaggerItem>
          <StatCard icon={Ticket} label="Aktivních poukazů" value={active.length} tone="accent" loading={query.isLoading} />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={Wallet} label="Nevyčerpaná hodnota" value={liability / 100} format={(n) => czk(Math.round(n * 100))} tone="warning" loading={query.isLoading} footer="Závazek vůči zákazníkům" />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={Gift} label="Prodáno celkem" value={sold / 100} format={(n) => czk(Math.round(n * 100))} tone="success" loading={query.isLoading} />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={Ticket} label="Uplatněno" value={redeemed / 100} format={(n) => czk(Math.round(n * 100))} tone="info" loading={query.isLoading} />
        </StaggerItem>
      </Stagger>

      <Tabs
        variant="pill"
        className="mb-4 sm:inline-flex"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "active", label: "Aktivní", count: active.length },
          { value: "closed", label: "Ukončené" },
          { value: "all", label: "Vše", count: rows.length },
        ]}
      />

      <DataTable
        columns={columns}
        rows={shown}
        getKey={(v) => v.id}
        loading={query.isLoading}
        empty={<EmptyState icon={Gift} title="Zatím žádné poukazy" description="Vystavte první poukaz a předejte ho zákazníkovi jako PDF." action={<Button onClick={() => setIssueOpen(true)}>Nový poukaz</Button>} />}
      />

      <IssueDialog open={issueOpen} onOpenChange={setIssueOpen} />
      <CheckDialog open={checkOpen} onOpenChange={setCheckOpen} />
    </div>
  );
}

function IssueDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { salon } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const services = useServices();
  const [amount, setAmount] = useState("1000");
  const [service, setService] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [expires, setExpires] = useState<string | null>(null);
  const presets = [500, 1000, 1500, 2000, 3000];

  const issue = useMutation({
    mutationFn: async () => {
      const { data, error } = await sb.rpc("issue_voucher", {
        p_salon: salon.id,
        p_amount: Math.round(Number(amount.replace(",", ".")) * 100),
        p_service: service || null,
        p_recipient_name: name || null,
        p_recipient_email: email || null,
        p_message: message || null,
        p_expires: expires ? `${expires}T23:59:59+00:00` : null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (id) => {
      toast.success("Poukaz vystaven");
      qc.invalidateQueries({ queryKey: ["vouchers"] });
      onOpenChange(false);
      setName("");
      setMessage("");
      window.open(`/api/vouchers/${id}/pdf`, "_blank");
    },
    onError: (error) => toast.error("Poukaz se nepodařilo vystavit", errorMessage(error)),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nový dárkový poukaz"
      description="Po vystavení se otevře PDF k vytištění nebo odeslání."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Zrušit
          </Button>
          <Button loading={issue.isPending} disabled={!amount || Number(amount.replace(",", ".")) <= 0} onClick={() => issue.mutate()} leading={<Gift className="h-4 w-4" />}>
            Vystavit poukaz
          </Button>
        </>
      }
    >
      <div className="grid gap-4 pb-2">
        <Field label="Hodnota (Kč)">
          <div className="flex flex-wrap items-center gap-2">
            {presets.map((value) => (
              <button key={value} type="button" onClick={() => setAmount(String(value))} className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all ${amount === String(value) ? "border-transparent bg-[image:var(--gradient-brand)] text-white shadow-glow" : "border-border hover:border-border-strong"}`}>
                {value.toLocaleString("cs-CZ")}
              </button>
            ))}
            <Input className="w-32" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} inputSize="sm" />
          </div>
        </Field>
        <Field label="Platí na službu" hint="Bez výběru platí na cokoliv">
          <Select value={service} onChange={(event) => setService(event.target.value)}>
            <option value="">Libovolnou službu</option>
            {(services.data?.services ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Pro koho">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Jméno obdarovaného" />
          </Field>
          <Field label="E-mail obdarovaného">
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
        </div>
        <Field label="Věnování">
          <Textarea rows={2} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Všechno nejlepší!" />
        </Field>
        <Field label="Platnost do" hint="Výchozí platnost je 12 měsíců">
          <DatePicker value={expires} onChange={setExpires} min={new Date().toISOString().slice(0, 10)} placeholder="Za 12 měsíců" />
        </Field>
      </div>
    </Dialog>
  );
}

function CheckDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { salon } = useSalon();
  const sb = useSb();
  const [code, setCode] = useState("");
  const [result, setResult] = useState<null | { balance: number; status: string; expires_at: string | null } | "none">(null);
  const check = useMutation({
    mutationFn: async () => {
      const { data, error } = await sb.rpc("lookup_voucher", { p_salon: salon.id, p_code: code });
      if (error) throw error;
      const row = (data ?? [])[0];
      return row ? { balance: Number(row.balance), status: row.status as string, expires_at: row.expires_at as string | null } : ("none" as const);
    },
    onSuccess: setResult,
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value);
        if (!value) {
          setResult(null);
          setCode("");
        }
      }}
      title="Ověřit kód poukazu"
      size="sm"
      footer={
        <Button loading={check.isPending} disabled={code.length < 4} onClick={() => check.mutate()} className="w-full sm:w-auto">
          Ověřit
        </Button>
      }
    >
      <div className="grid gap-4 pb-2">
        <Input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX" inputSize="lg" className="text-center font-mono tracking-widest" autoFocus />
        {result === "none" && <p className="rounded-md bg-danger-soft px-3 py-2.5 text-center text-sm text-danger">Poukaz s tímto kódem neexistuje.</p>}
        {result && result !== "none" && (
          <div className="rounded-lg bg-[image:var(--gradient-soft)] p-5 text-center">
            <Badge tone={statusView[result.status]?.tone} dot>{statusView[result.status]?.label}</Badge>
            <p className="mt-3 text-sm text-fg-muted">Zůstatek</p>
            <p className="text-3xl font-semibold tabular">{czk(result.balance)}</p>
            {result.expires_at && <p className="mt-1 text-xs text-fg-subtle">Platí do {new Date(result.expires_at).toLocaleDateString("cs-CZ")}</p>}
          </div>
        )}
      </div>
    </Dialog>
  );
}
