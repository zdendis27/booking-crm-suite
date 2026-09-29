"use client";

import { invoiceKind, invoiceStatus, paymentMethod } from "@repo/copy";
import { Badge, Button, Card, CardHeader, DatePicker, Dialog, EmptyState, Field, Input, Select, Skeleton, Textarea, cn, useToast } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CircleDollarSign, Download, FilePlus2, FileText, Link2, Mail, Plus, Save, Send, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { useSalon } from "@/components/app/salon-context";
import { czk } from "@/lib/format";
import { errorMessage, useSb } from "@/lib/data";
import { todayLocal } from "@/lib/time";

interface Invoice {
  id: string;
  kind: "invoice" | "proforma" | "credit_note";
  status: string;
  number: string | null;
  variable_symbol: string | null;
  client_id: string | null;
  booking_id: string | null;
  related_invoice_id: string | null;
  supplier: Record<string, string | boolean> | null;
  customer_name: string;
  customer_ico: string | null;
  customer_dic: string | null;
  customer_street: string | null;
  customer_city: string | null;
  customer_zip: string | null;
  customer_email: string | null;
  issue_date: string | null;
  taxable_supply_date: string | null;
  due_date: string | null;
  vat_payer: boolean;
  total_net: number;
  total_vat: number;
  total_gross: number;
  vat_summary: { rate: number; base: number; vat: number; gross: number }[];
  advance_paid: number;
  paid_amount: number;
  note: string | null;
  sent_at: string | null;
}

interface Item {
  id?: string;
  key: string;
  description: string;
  quantity: string;
  unit: string;
  unit_price: string;
  vat_rate: string;
}

let counter = 0;
const newKey = () => `k${++counter}`;

export function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const { salon } = useSalon();
  const sb = useSb();

  const invoice = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: async () => {
      const { data, error } = await sb.from("invoices").select("*").eq("id", invoiceId).single();
      if (error) throw error;
      return data as unknown as Invoice;
    },
  });
  const items = useQuery({
    queryKey: ["invoice", invoiceId, "items"],
    queryFn: async () => {
      const { data } = await sb.from("invoice_items").select("id,description,quantity,unit,unit_price,vat_rate,total_gross,position").eq("invoice_id", invoiceId).order("position");
      return (data ?? []) as any[];
    },
  });

  if (invoice.isLoading || items.isLoading) return <Skeleton className="h-[40rem] rounded-lg" />;
  if (!invoice.data) return <EmptyState icon={FileText} title="Doklad nenalezen" action={<Button asChild><Link href={`/app/${salon.slug}/faktury`}>Zpět na faktury</Link></Button>} />;

  return invoice.data.status === "draft" ? <DraftEditor invoice={invoice.data} items={items.data ?? []} /> : <IssuedView invoice={invoice.data} items={items.data ?? []} />;
}

function Back() {
  const { salon } = useSalon();
  return (
    <Link href={`/app/${salon.slug}/faktury`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg">
      <ArrowLeft className="h-4 w-4" /> Všechny faktury
    </Link>
  );
}

function toHalere(value: string) {
  return Math.round(Number(value.replace(",", ".") || 0) * 100);
}

function lineTotal(item: Item) {
  return Math.round(Number(item.quantity.replace(",", ".") || 0) * toHalere(item.unit_price));
}

function recap(items: Item[]) {
  const map = new Map<number, number>();
  for (const item of items) {
    const rate = Number(item.vat_rate);
    map.set(rate, (map.get(rate) ?? 0) + lineTotal(item));
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, gross]) => {
      const base = Math.round(gross / (1 + rate / 100));
      return { rate, gross, base, vat: gross - base };
    });
}

function DraftEditor({ invoice, items: saved }: { invoice: Invoice; items: any[] }) {
  const { salon, hasFeature } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const today = todayLocal(salon.timezone);
  const billing = useQuery({
    queryKey: ["billing-profile", salon.id],
    queryFn: async () => (await sb.from("salon_billing_profiles").select("vat_payer,default_due_days,legal_name,ico").eq("salon_id", salon.id).maybeSingle()).data as { vat_payer: boolean; default_due_days: number; legal_name: string | null; ico: string | null } | null,
  });
  const vatPayer = billing.data?.vat_payer ?? false;

  const [customer, setCustomer] = useState({ name: invoice.customer_name, ico: invoice.customer_ico ?? "", dic: invoice.customer_dic ?? "", street: invoice.customer_street ?? "", city: invoice.customer_city ?? "", zip: invoice.customer_zip ?? "", email: invoice.customer_email ?? "" });
  const [items, setItems] = useState<Item[]>([]);
  const [note, setNote] = useState(invoice.note ?? "");
  const [issueDate, setIssueDate] = useState<string | null>(today);
  const [duzp, setDuzp] = useState<string | null>(today);

  useEffect(() => {
    setItems(
      saved.map((row) => ({
        id: row.id,
        key: newKey(),
        description: row.description,
        quantity: String(Number(row.quantity)),
        unit: row.unit,
        unit_price: String(row.unit_price / 100),
        vat_rate: String(Number(row.vat_rate)),
      })),
    );
  }, [saved]);

  const rows = recap(items);
  const total = rows.reduce((sum, r) => sum + r.gross, 0);

  const persist = async () => {
    const update = await sb
      .from("invoices")
      .update({ customer_name: customer.name.trim(), customer_ico: customer.ico.trim() || null, customer_dic: customer.dic.trim() || null, customer_street: customer.street || null, customer_city: customer.city || null, customer_zip: customer.zip || null, customer_email: customer.email.trim() || null, note: note || null })
      .eq("id", invoice.id);
    if (update.error) throw update.error;
    const del = await sb.from("invoice_items").delete().eq("invoice_id", invoice.id);
    if (del.error) throw del.error;
    const valid = items.filter((item) => item.description.trim());
    if (valid.length) {
      const insert = await sb.from("invoice_items").insert(
        valid.map((item, index) => ({
          salon_id: salon.id,
          invoice_id: invoice.id,
          position: index,
          description: item.description.trim(),
          quantity: Number(item.quantity.replace(",", ".") || 1),
          unit: item.unit || "ks",
          unit_price: toHalere(item.unit_price),
          vat_rate: vatPayer ? Number(item.vat_rate) : 0,
        })),
      );
      if (insert.error) throw insert.error;
    }
    const recompute = await sb.rpc("recompute_invoice_draft", { p_invoice: invoice.id });
    if (recompute.error) throw recompute.error;
  };

  const save = useMutation({
    mutationFn: persist,
    onSuccess: () => {
      toast.success("Koncept uložen");
      qc.invalidateQueries({ queryKey: ["invoice", invoice.id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (error) => toast.error("Koncept se nepodařilo uložit", errorMessage(error)),
  });

  const issue = useMutation({
    mutationFn: async () => {
      await persist();
      const { data, error } = await sb.rpc("issue_invoice", { p_invoice: invoice.id, p_issue_date: issueDate ?? today, p_duzp: invoice.kind === "proforma" ? null : (duzp ?? issueDate ?? today) });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (number) => {
      toast.success(`Doklad ${number} vystaven`);
      qc.invalidateQueries({ queryKey: ["invoice"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (error) => toast.error("Doklad se nepodařilo vystavit", errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("invoices").delete().eq("id", invoice.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      router.push(`/app/${salon.slug}/faktury`);
    },
  });

  function update(key: string, patch: Partial<Item>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  const missingBilling = billing.data && (!billing.data.legal_name || !billing.data.ico);

  return (
    <div>
      <Back />
      <PageHeader
        eyebrow={invoiceKind[invoice.kind]}
        title="Koncept dokladu"
        description="Upravte odběratele a položky. Číslo dokladu se přidělí až při vystavení."
        actions={
          <>
            <Button variant="ghost" onClick={() => remove.mutate()} leading={<Trash2 className="h-4 w-4" />}>
              Smazat koncept
            </Button>
            <Button variant="secondary" loading={save.isPending} onClick={() => save.mutate()} leading={<Save className="h-4 w-4" />}>
              Uložit
            </Button>
            <Button loading={issue.isPending} disabled={!hasFeature("invoicing") || items.every((i) => !i.description.trim())} onClick={() => issue.mutate()} leading={<Send className="h-4 w-4" />}>
              Vystavit
            </Button>
          </>
        }
      />

      {missingBilling && (
        <div className="mb-5 flex items-center gap-3 rounded-lg border border-warning/30 bg-warning-soft p-4 text-sm">
          <span className="flex-1">Před vystavením doplňte své fakturační údaje (název, IČO, adresa, účet).</span>
          <Button asChild size="sm" variant="secondary">
            <Link href={`/app/${salon.slug}/nastaveni/fakturace`}>Doplnit údaje</Link>
          </Button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="grid content-start gap-5">
          <Card>
            <CardHeader title="Odběratel" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Název / jméno" required className="sm:col-span-2">
                <Input value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} />
              </Field>
              <Field label="IČO">
                <Input value={customer.ico} onChange={(event) => setCustomer({ ...customer, ico: event.target.value })} />
              </Field>
              <Field label="DIČ">
                <Input value={customer.dic} onChange={(event) => setCustomer({ ...customer, dic: event.target.value })} />
              </Field>
              <Field label="Ulice" className="sm:col-span-2">
                <Input value={customer.street} onChange={(event) => setCustomer({ ...customer, street: event.target.value })} />
              </Field>
              <Field label="Město">
                <Input value={customer.city} onChange={(event) => setCustomer({ ...customer, city: event.target.value })} />
              </Field>
              <Field label="PSČ">
                <Input value={customer.zip} onChange={(event) => setCustomer({ ...customer, zip: event.target.value })} />
              </Field>
              <Field label="E-mail pro odeslání" className="sm:col-span-2">
                <Input type="email" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Položky" description={vatPayer ? "Ceny zadávejte s DPH." : "Jste neplátce DPH, doklad bude bez DPH."} />
            <div className="ui-scroll overflow-x-auto p-3 sm:p-5">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-fg-subtle">
                    <th className="pb-2 pr-2 font-medium">Popis</th>
                    <th className="w-20 pb-2 pr-2 font-medium">Množství</th>
                    <th className="w-20 pb-2 pr-2 font-medium">Jednotka</th>
                    <th className="w-28 pb-2 pr-2 font-medium">Cena za jedn. (Kč)</th>
                    {vatPayer && <th className="w-24 pb-2 pr-2 font-medium">DPH</th>}
                    <th className="w-28 pb-2 text-right font-medium">Celkem</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.key} className="align-top">
                      <td className="py-1 pr-2">
                        <Input value={item.description} onChange={(event) => update(item.key, { description: event.target.value })} inputSize="sm" placeholder="Popis položky" />
                      </td>
                      <td className="py-1 pr-2">
                        <Input value={item.quantity} onChange={(event) => update(item.key, { quantity: event.target.value })} inputSize="sm" inputMode="decimal" />
                      </td>
                      <td className="py-1 pr-2">
                        <Input value={item.unit} onChange={(event) => update(item.key, { unit: event.target.value })} inputSize="sm" />
                      </td>
                      <td className="py-1 pr-2">
                        <Input value={item.unit_price} onChange={(event) => update(item.key, { unit_price: event.target.value })} inputSize="sm" inputMode="decimal" />
                      </td>
                      {vatPayer && (
                        <td className="py-1 pr-2">
                          <Select value={item.vat_rate} onChange={(event) => update(item.key, { vat_rate: event.target.value })} className="h-9">
                            <option value="21">21 %</option>
                            <option value="12">12 %</option>
                            <option value="0">0 %</option>
                          </Select>
                        </td>
                      )}
                      <td className="py-1 pt-2.5 text-right font-semibold tabular">{czk(lineTotal(item))}</td>
                      <td className="py-1 pl-1">
                        <button type="button" onClick={() => setItems((current) => current.filter((i) => i.key !== item.key))} className="rounded-sm p-1.5 text-fg-subtle hover:bg-danger-soft hover:text-danger" aria-label="Odebrat">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Button variant="soft" size="sm" className="mt-3" onClick={() => setItems([...items, { key: newKey(), description: "", quantity: "1", unit: "ks", unit_price: "", vat_rate: vatPayer ? "21" : "0" }])} leading={<Plus className="h-4 w-4" />}>
                Přidat položku
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Poznámka na dokladu" />
            <div className="p-5">
              <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Např. Děkujeme za využití našich služeb." />
            </div>
          </Card>
        </div>

        <div className="grid content-start gap-5">
          <Card>
            <CardHeader title="Data" />
            <div className="grid gap-4 p-5">
              <Field label="Datum vystavení">
                <DatePicker value={issueDate} onChange={setIssueDate} />
              </Field>
              {invoice.kind !== "proforma" && (
                <Field label="Datum zdanitelného plnění" hint="Nejčastěji den poskytnutí služby">
                  <DatePicker value={duzp} onChange={setDuzp} />
                </Field>
              )}
              <p className="text-xs text-fg-muted">Splatnost se dopočítá podle nastavení ({billing.data?.default_due_days ?? 14} dní).</p>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="bg-[image:var(--gradient-brand)] p-5 text-white">
              <p className="text-sm text-white/80">Celkem k úhradě</p>
              <p className="mt-1 text-3xl font-semibold tabular">{czk(total)}</p>
            </div>
            {vatPayer && rows.length > 0 && (
              <div className="p-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-subtle">Rekapitulace DPH</p>
                <table className="w-full text-sm">
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.rate} className="border-t border-border first:border-0">
                        <td className="py-1.5">{row.rate} %</td>
                        <td className="py-1.5 text-right tabular text-fg-muted">základ {czk(row.base)}</td>
                        <td className="py-1.5 text-right tabular">DPH {czk(row.vat)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function IssuedView({ invoice, items }: { invoice: Invoice; items: any[] }) {
  const { salon, hasFeature } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const [dialog, setDialog] = useState<null | "pay" | "credit" | "send">(null);
  const balance = invoice.total_gross - invoice.advance_paid - invoice.paid_amount;
  const status = invoiceStatus[invoice.status];
  const today = todayLocal(salon.timezone);
  const overdue = ["issued", "partially_paid"].includes(invoice.status) && invoice.kind !== "credit_note" && !!invoice.due_date && invoice.due_date < today;

  const spayd = useQuery({
    queryKey: ["invoice", invoice.id, "spayd"],
    queryFn: async () => {
      const { data } = await sb.rpc("invoice_spayd", { p_invoice: invoice.id });
      return typeof data === "string" ? data : null;
    },
  });
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    if (spayd.data) QRCode.toString(spayd.data, { type: "svg", margin: 0, width: 132 }).then(setQr);
    else setQr(null);
  }, [spayd.data]);

  const related = useQuery({
    queryKey: ["invoice", invoice.id, "related"],
    queryFn: async () => {
      const { data } = await sb.from("invoices").select("id,number,kind,status,total_gross").or(`related_invoice_id.eq.${invoice.id}${invoice.related_invoice_id ? `,id.eq.${invoice.related_invoice_id}` : ""}`);
      return (data ?? []) as { id: string; number: string | null; kind: string; status: string; total_gross: number }[];
    },
  });

  const payments = useQuery({
    queryKey: ["invoice", invoice.id, "payments"],
    queryFn: async () => {
      const { data } = await sb.from("invoice_payments").select("id,amount,paid_on,bank_ref,payment_id").eq("invoice_id", invoice.id).order("paid_on");
      return (data ?? []) as { id: string; amount: number; paid_on: string; bank_ref: string | null }[];
    },
  });

  const convert = useMutation({
    mutationFn: async () => {
      const { data, error } = await sb.rpc("convert_proforma", { p_proforma: invoice.id });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (id) => router.push(`/app/${salon.slug}/faktury/${id}`),
    onError: (error) => toast.error("Převod se nepodařil", errorMessage(error)),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["invoice"] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["finance"] });
  };

  const supplier = (invoice.supplier ?? {}) as Record<string, string>;

  return (
    <div>
      <Back />
      <PageHeader
        eyebrow={invoiceKind[invoice.kind]}
        title={invoice.number ?? ""}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {overdue ? <Badge tone="danger" dot>Po splatnosti</Badge> : <Badge tone={status?.tone} dot>{status?.label}</Badge>}
            {invoice.sent_at && <Badge tone="info">Odesláno {new Date(invoice.sent_at).toLocaleDateString("cs-CZ")}</Badge>}
          </span>
        }
        actions={
          <>
            <Button variant="secondary" asChild leading={undefined}>
              <a href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer">
                <Download className="h-4 w-4" /> PDF
              </a>
            </Button>
            <Button variant="secondary" onClick={() => setDialog("send")} leading={<Mail className="h-4 w-4" />}>
              Odeslat
            </Button>
            {["issued", "partially_paid"].includes(invoice.status) && invoice.kind !== "credit_note" && (
              <Button onClick={() => setDialog("pay")} leading={<CircleDollarSign className="h-4 w-4" />}>
                Zapsat úhradu
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
        <Card className="overflow-hidden">
          <div className="h-2 bg-[image:var(--gradient-brand)]" />
          <div className="p-6 sm:p-9">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">{invoice.kind === "credit_note" ? "Dobropis" : invoice.kind === "proforma" ? "Zálohová faktura" : invoice.vat_payer ? "Faktura – daňový doklad" : "Faktura"}</p>
                <p className="mt-1 text-3xl font-semibold tracking-tight tabular">{invoice.number}</p>
              </div>
              {invoice.status === "paid" && <span className="rotate-[-6deg] rounded-md border-2 border-success px-3 py-1 text-lg font-bold uppercase tracking-wider text-success">Uhrazeno</span>}
              {invoice.status === "cancelled" && <span className="rotate-[-6deg] rounded-md border-2 border-danger px-3 py-1 text-lg font-bold uppercase tracking-wider text-danger">Stornováno</span>}
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-md border border-border bg-surface-2/50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Dodavatel</p>
                <p className="mt-1.5 font-semibold">{supplier.name}</p>
                <p className="text-sm text-fg-muted">{supplier.street}</p>
                <p className="text-sm text-fg-muted">{[supplier.zip, supplier.city].filter(Boolean).join(" ")}</p>
                <p className="mt-1.5 text-sm text-fg-muted">IČO: {supplier.ico}{supplier.dic ? ` · DIČ: ${supplier.dic}` : " · Neplátce DPH"}</p>
              </div>
              <div className="rounded-md border border-border bg-surface-2/50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Odběratel</p>
                <p className="mt-1.5 font-semibold">{invoice.customer_name}</p>
                <p className="text-sm text-fg-muted">{invoice.customer_street}</p>
                <p className="text-sm text-fg-muted">{[invoice.customer_zip, invoice.customer_city].filter(Boolean).join(" ")}</p>
                <p className="mt-1.5 text-sm text-fg-muted">{invoice.customer_ico ? `IČO: ${invoice.customer_ico}` : ""}{invoice.customer_dic ? ` · DIČ: ${invoice.customer_dic}` : ""}</p>
              </div>
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              {[
                ["Datum vystavení", invoice.issue_date],
                ...(invoice.kind !== "proforma" ? [["Datum zdanitelného plnění", invoice.taxable_supply_date]] : []),
                ["Splatnost", invoice.due_date],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-xs text-fg-subtle">{label}</dt>
                  <dd className="font-semibold tabular">{value ? new Date(value as string).toLocaleDateString("cs-CZ") : "—"}</dd>
                </div>
              ))}
              <div>
                <dt className="text-xs text-fg-subtle">Variabilní symbol</dt>
                <dd className="font-semibold tabular">{invoice.variable_symbol}</dd>
              </div>
              <div>
                <dt className="text-xs text-fg-subtle">Bankovní účet</dt>
                <dd className="font-semibold tabular">{supplier.bank_account || supplier.iban || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-fg-subtle">Způsob úhrady</dt>
                <dd className="font-semibold">Bankovní převod</dd>
              </div>
            </dl>

            <div className="ui-scroll mt-7 overflow-x-auto">
              <table className="w-full min-w-[30rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-fg-subtle">
                    <th className="py-2.5 pr-3 font-medium">Popis</th>
                    <th className="px-3 py-2.5 text-right font-medium">Množství</th>
                    <th className="px-3 py-2.5 text-right font-medium">Cena za jedn.</th>
                    {invoice.vat_payer && <th className="px-3 py-2.5 text-right font-medium">DPH</th>}
                    <th className="py-2.5 pl-3 text-right font-medium">Celkem</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-0">
                      <td className="py-3 pr-3 font-medium">{item.description}</td>
                      <td className="px-3 py-3 text-right tabular">{Number(item.quantity)} {item.unit}</td>
                      <td className="px-3 py-3 text-right tabular">{czk(item.unit_price)}</td>
                      {invoice.vat_payer && <td className="px-3 py-3 text-right tabular">{Number(item.vat_rate)} %</td>}
                      <td className="py-3 pl-3 text-right font-semibold tabular">{czk(item.total_gross)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-center gap-4">
                {qr && (
                  <div className="rounded-md border border-border bg-white p-2">
                    <div className="h-[132px] w-[132px] [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
                  </div>
                )}
                {qr && (
                  <div className="text-sm">
                    <p className="font-semibold">QR platba</p>
                    <p className="text-fg-muted">Naskenujte v aplikaci své banky.</p>
                  </div>
                )}
              </div>
              <div className="min-w-64 space-y-1.5">
                {invoice.vat_payer &&
                  invoice.vat_summary.map((row) => (
                    <div key={row.rate} className="flex justify-between text-sm text-fg-muted">
                      <span>DPH {Number(row.rate)} % (základ {czk(row.base)})</span>
                      <span className="tabular">{czk(row.vat)}</span>
                    </div>
                  ))}
                {invoice.advance_paid > 0 && (
                  <div className="flex justify-between text-sm text-fg-muted">
                    <span>Uhrazená záloha</span>
                    <span className="tabular">−{czk(invoice.advance_paid)}</span>
                  </div>
                )}
                <div className="flex items-baseline justify-between rounded-md bg-[image:var(--gradient-soft)] px-4 py-3">
                  <span className="font-medium">{invoice.kind === "credit_note" ? "Dobropis celkem" : "Celkem k úhradě"}</span>
                  <span className="text-2xl font-semibold tabular">{czk(invoice.kind === "credit_note" ? invoice.total_gross : Math.max(0, balance) || invoice.total_gross)}</span>
                </div>
              </div>
            </div>
            {(invoice.note || supplier.note) && <p className="mt-6 whitespace-pre-wrap text-sm text-fg-muted">{[invoice.note, supplier.note].filter(Boolean).join("\n")}</p>}
          </div>
        </Card>

        <div className="grid content-start gap-5">
          {invoice.kind !== "credit_note" && (
            <Card>
              <CardHeader title="Úhrada" />
              <div className="p-5">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-fg-muted">Zbývá uhradit</span>
                  <span className="text-2xl font-semibold tabular">{czk(Math.max(0, balance))}</span>
                </div>
                <ul className="mt-4 divide-y divide-border">
                  {(payments.data ?? []).length === 0 && <li className="py-2 text-sm text-fg-muted">Zatím žádná úhrada.</li>}
                  {(payments.data ?? []).map((p) => (
                    <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                      <span>
                        <span className="block font-medium tabular">{czk(p.amount)}</span>
                        <span className="text-xs text-fg-subtle">{new Date(p.paid_on).toLocaleDateString("cs-CZ")}{p.bank_ref ? ` · ${p.bank_ref}` : ""}</span>
                      </span>
                      <Badge tone="success">Uhrazeno</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Akce" />
            <div className="grid gap-2 p-4">
              {invoice.kind === "proforma" && ["issued", "partially_paid", "paid"].includes(invoice.status) && (
                <Button variant="soft" onClick={() => convert.mutate()} loading={convert.isPending} leading={<FilePlus2 className="h-4 w-4" />}>
                  Převést na fakturu
                </Button>
              )}
              {invoice.kind === "invoice" && ["issued", "partially_paid", "paid"].includes(invoice.status) && hasFeature("invoicing") && (
                <Button variant="secondary" onClick={() => setDialog("credit")} leading={<Undo2 className="h-4 w-4" />}>
                  Vystavit dobropis
                </Button>
              )}
              {invoice.booking_id && (
                <Button variant="ghost" asChild>
                  <Link href={`/app/${salon.slug}/kalendar?rezervace=${invoice.booking_id}`}>
                    <Link2 className="h-4 w-4" /> Zobrazit rezervaci
                  </Link>
                </Button>
              )}
            </div>
          </Card>

          {(related.data ?? []).length > 0 && (
            <Card>
              <CardHeader title="Související doklady" />
              <ul className="divide-y divide-border p-2">
                {(related.data ?? []).map((r) => (
                  <li key={r.id}>
                    <Link href={`/app/${salon.slug}/faktury/${r.id}`} className="flex items-center gap-3 rounded-md px-3 py-3 transition-colors hover:bg-surface-2">
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="block font-medium">{r.number ?? "Koncept"}</span>
                        <span className="text-xs text-fg-subtle">{invoiceKind[r.kind]}</span>
                      </span>
                      <Badge tone={invoiceStatus[r.status]?.tone}>{invoiceStatus[r.status]?.label}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {dialog === "pay" && <PayDialog invoice={invoice} balance={balance} onClose={() => setDialog(null)} onDone={refresh} />}
      {dialog === "credit" && <CreditDialog invoice={invoice} onClose={() => setDialog(null)} onDone={(id) => router.push(`/app/${salon.slug}/faktury/${id}`)} />}
      {dialog === "send" && <SendDialog invoice={invoice} onClose={() => setDialog(null)} onDone={refresh} />}
    </div>
  );
}

function PayDialog({ invoice, balance, onClose, onDone }: { invoice: Invoice; balance: number; onClose: () => void; onDone: () => void }) {
  const { salon } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const [amount, setAmount] = useState(String(balance / 100));
  const [method, setMethod] = useState("bank_transfer");
  const [date, setDate] = useState<string | null>(todayLocal(salon.timezone));
  const pay = useMutation({
    mutationFn: async () => {
      const { error } = await sb.rpc("record_invoice_payment", { p_invoice: invoice.id, p_amount: Math.round(Number(amount.replace(",", ".")) * 100), p_method: method, p_paid_on: date, p_bank_ref: null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Úhrada zapsána");
      onDone();
      onClose();
    },
    onError: (error) => toast.error("Úhradu se nepodařilo zapsat", errorMessage(error)),
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Zapsat úhradu"
      description={`Zbývá uhradit ${czk(balance)}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button loading={pay.isPending} disabled={!amount} onClick={() => pay.mutate()}>
            Zapsat
          </Button>
        </>
      }
    >
      <div className="grid gap-4 pb-2">
        <Field label="Částka (Kč)">
          <div className="flex gap-2">
            <Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
            <Button variant="secondary" onClick={() => setAmount(String(balance / 100))}>
              Celá
            </Button>
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Způsob">
            <Select value={method} onChange={(event) => setMethod(event.target.value)}>
              {["bank_transfer", "cash", "card", "qr", "other"].map((m) => (
                <option key={m} value={m}>
                  {paymentMethod[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Datum úhrady">
            <DatePicker value={date} onChange={setDate} />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

function CreditDialog({ invoice, onClose, onDone }: { invoice: Invoice; onClose: () => void; onDone: (id: string) => void }) {
  const sb = useSb();
  const toast = useToast();
  const [mode, setMode] = useState("full");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("21");
  const [reason, setReason] = useState("");
  const create = useMutation({
    mutationFn: async () => {
      const items = mode === "full" ? null : [{ description: `Oprava: ${reason || "částečný dobropis"}`, quantity: 1, unit: "ks", unit_price: Math.round(Number(amount.replace(",", ".")) * 100), vat_rate: invoice.vat_payer ? Number(rate) : 0 }];
      const { data, error } = await sb.rpc("create_credit_note", { p_invoice: invoice.id, p_reason: reason, p_items: items });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (id) => {
      toast.success("Dobropis vystaven");
      onDone(id);
    },
    onError: (error) => toast.error("Dobropis se nepodařilo vystavit", errorMessage(error)),
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Vystavit dobropis"
      description={`K dokladu ${invoice.number}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button loading={create.isPending} disabled={!reason.trim() || (mode === "partial" && !amount)} onClick={() => create.mutate()}>
            Vystavit dobropis
          </Button>
        </>
      }
    >
      <div className="grid gap-4 pb-2">
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: "full", label: "Celý doklad", hint: "Stornuje fakturu" },
            { value: "partial", label: "Část částky", hint: "Snížení ceny" },
          ].map((item) => (
            <button key={item.value} type="button" onClick={() => setMode(item.value)} className={cn("rounded-md border p-3 text-left transition-all", mode === item.value ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong")}>
              <p className="text-sm font-semibold">{item.label}</p>
              <p className="text-xs text-fg-muted">{item.hint}</p>
            </button>
          ))}
        </div>
        {mode === "partial" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Částka s DPH (Kč)">
              <Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </Field>
            {invoice.vat_payer && (
              <Field label="Sazba DPH">
                <Select value={rate} onChange={(event) => setRate(event.target.value)}>
                  <option value="21">21 %</option>
                  <option value="12">12 %</option>
                  <option value="0">0 %</option>
                </Select>
              </Field>
            )}
          </div>
        )}
        <Field label="Důvod" required>
          <Textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

function SendDialog({ invoice, onClose, onDone }: { invoice: Invoice; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [to, setTo] = useState(invoice.customer_email ?? "");
  const send = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/invoices/${invoice.id}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Odeslání se nezdařilo");
    },
    onSuccess: () => {
      toast.success("Doklad odeslán e-mailem", to);
      onDone();
      onClose();
    },
    onError: (error) => toast.error("Doklad se nepodařilo odeslat", (error as Error).message),
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Odeslat e-mailem"
      description="PDF doklad se odešle jako příloha."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button loading={send.isPending} disabled={!/^\S+@\S+\.\S+$/.test(to)} onClick={() => send.mutate()} leading={<Send className="h-4 w-4" />}>
            Odeslat
          </Button>
        </>
      }
    >
      <div className="pb-2">
        <Field label="E-mail příjemce">
          <Input type="email" value={to} onChange={(event) => setTo(event.target.value)} autoFocus />
        </Field>
      </div>
    </Dialog>
  );
}

