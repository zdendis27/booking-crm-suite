"use client";

import { invoiceKind } from "@repo/copy";
import { Button, Card, CardHeader, Field, Input, Skeleton, Switch, Textarea, useToast } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Search } from "lucide-react";
import { useState } from "react";
import { useSalon } from "@/components/app/salon-context";
import { errorMessage, useSb } from "@/lib/data";

export function BillingProfileSettings() {
  const { salon, can } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const editable = can(["owner", "manager"]);
  const [form, setForm] = useState<Record<string, string | boolean> | null>(null);
  const [series, setSeries] = useState<Record<string, string>>({ invoice: "FV", proforma: "ZF", credit_note: "DB" });
  const [looking, setLooking] = useState(false);

  const profile = useQuery({
    queryKey: ["billing", salon.id],
    queryFn: async () => {
      const [p, s] = await Promise.all([sb.from("salon_billing_profiles").select("*").eq("salon_id", salon.id).maybeSingle(), sb.from("invoice_series").select("kind,prefix").eq("salon_id", salon.id)]);
      return { profile: p.data as any, series: (s.data ?? []) as { kind: string; prefix: string }[] };
    },
  });

  if (profile.data && !form) {
    const p = profile.data.profile ?? {};
    setForm({ legal_name: p.legal_name ?? "", ico: p.ico ?? "", dic: p.dic ?? "", vat_payer: !!p.vat_payer, street: p.address_street ?? "", city: p.address_city ?? "", zip: p.address_zip ?? "", iban: p.iban ?? "", bank_account: p.bank_account ?? "", due: String(p.default_due_days ?? 14), note: p.invoice_note ?? "" });
    setSeries({ invoice: "FV", proforma: "ZF", credit_note: "DB", ...Object.fromEntries(profile.data.series.map((x) => [x.kind, x.prefix])) });
  }

  const save = useMutation({
    mutationFn: async () => {
      const f = form!;
      const { error } = await sb.from("salon_billing_profiles").upsert(
        { salon_id: salon.id, legal_name: (f.legal_name as string).trim() || null, ico: (f.ico as string).replace(/\s/g, "") || null, dic: (f.dic as string).trim().toUpperCase() || null, vat_payer: f.vat_payer, address_street: f.street || null, address_city: f.city || null, address_zip: f.zip || null, iban: (f.iban as string).replace(/\s/g, "").toUpperCase() || null, bank_account: f.bank_account || null, default_due_days: Number(f.due), invoice_note: f.note || null },
        { onConflict: "salon_id" },
      );
      if (error) throw error;
      for (const [kind, prefix] of Object.entries(series)) {
        const r = await sb.from("invoice_series").upsert({ salon_id: salon.id, kind, prefix: prefix.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) }, { onConflict: "salon_id,kind" });
        if (r.error) throw r.error;
      }
    },
    onSuccess: () => {
      toast.success("Fakturační údaje uloženy");
      qc.invalidateQueries({ queryKey: ["billing"] });
      qc.invalidateQueries({ queryKey: ["billing-profile"] });
    },
    onError: (error) => toast.error("Uložení se nepodařilo", errorMessage(error)),
  });

  async function lookup() {
    setLooking(true);
    try {
      const response = await fetch(`/api/ares?ico=${(form!.ico as string).replace(/\s/g, "")}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setForm({ ...form!, legal_name: data.name, dic: data.dic, street: data.street, city: data.city, zip: data.zip, vat_payer: form!.vat_payer || !!data.dic });
      toast.success("Údaje načteny z ARES");
    } catch (error) {
      toast.error("Načtení z ARES se nezdařilo", (error as Error).message);
    } finally {
      setLooking(false);
    }
  }

  if (!form) return <Skeleton className="h-96 rounded-lg" />;
  const set = (key: string, value: string | boolean) => setForm({ ...form, [key]: value });
  const year = new Date().getFullYear();

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader title="Dodavatel na dokladech" description="Údaje, které se vytisknou na fakturách. Bez nich nelze fakturu vystavit." />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="IČO" hint="Načteme údaje z registru ARES">
            <div className="flex gap-2">
              <Input value={form.ico as string} onChange={(event) => set("ico", event.target.value)} inputMode="numeric" disabled={!editable} />
              <Button variant="secondary" onClick={lookup} disabled={(form.ico as string).replace(/\s/g, "").length !== 8 || looking || !editable} leading={looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}>
                ARES
              </Button>
            </div>
          </Field>
          <Field label="Obchodní název / jméno" required>
            <Input value={form.legal_name as string} onChange={(event) => set("legal_name", event.target.value)} disabled={!editable} />
          </Field>
          <Field label="Ulice a číslo" className="sm:col-span-2">
            <Input value={form.street as string} onChange={(event) => set("street", event.target.value)} disabled={!editable} />
          </Field>
          <Field label="Město">
            <Input value={form.city as string} onChange={(event) => set("city", event.target.value)} disabled={!editable} />
          </Field>
          <Field label="PSČ">
            <Input value={form.zip as string} onChange={(event) => set("zip", event.target.value)} disabled={!editable} />
          </Field>
          <div className="flex items-center justify-between gap-4 rounded-md border border-border p-4 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">Jsem plátce DPH</p>
              <p className="text-xs text-fg-muted">Faktury budou daňové doklady s rozpadem DPH podle sazeb (21 %, 12 %).</p>
            </div>
            <Switch checked={form.vat_payer as boolean} onCheckedChange={(value) => set("vat_payer", value)} disabled={!editable} label="Plátce DPH" />
          </div>
          {(form.vat_payer as boolean) && (
            <Field label="DIČ" required hint="Např. CZ12345678" className="sm:col-span-2">
              <Input value={form.dic as string} onChange={(event) => set("dic", event.target.value)} disabled={!editable} />
            </Field>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Platební údaje" description="Použijí se pro QR platbu a variabilní symbol." />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="IBAN" hint="Pro QR platbu" className="sm:col-span-2">
            <Input value={form.iban as string} onChange={(event) => set("iban", event.target.value)} placeholder="CZ65 0800 0000 1920 0014 5399" disabled={!editable} className="font-mono" />
          </Field>
          <Field label="Číslo účtu (zobrazí se na dokladu)">
            <Input value={form.bank_account as string} onChange={(event) => set("bank_account", event.target.value)} placeholder="192000145399/0800" disabled={!editable} />
          </Field>
          <Field label="Výchozí splatnost (dní)">
            <Input type="number" min={0} value={form.due as string} onChange={(event) => set("due", event.target.value)} disabled={!editable} />
          </Field>
          <Field label="Poznámka na dokladech" className="sm:col-span-2">
            <Textarea rows={2} value={form.note as string} onChange={(event) => set("note", event.target.value)} placeholder="Např. Fyzická osoba zapsaná v živnostenském rejstříku." disabled={!editable} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Číslování dokladů" description="Řada je bez mezer a každý rok začíná od jedničky. Předčíslí lze změnit jen před vystavením prvního dokladu." />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          {(["invoice", "proforma", "credit_note"] as const).map((kind) => (
            <Field key={kind} label={invoiceKind[kind]} hint={`Např. ${series[kind]}${year}0001`}>
              <Input value={series[kind]} onChange={(event) => setSeries({ ...series, [kind]: event.target.value.toUpperCase() })} maxLength={6} disabled={!editable} className="font-mono" />
            </Field>
          ))}
        </div>
      </Card>

      {editable && (
        <div className="sticky bottom-20 z-10 flex justify-end lg:bottom-4">
          <Button size="lg" loading={save.isPending} onClick={() => save.mutate()} leading={<Save className="h-[18px] w-[18px]" />} className="shadow-lg">
            Uložit údaje
          </Button>
        </div>
      )}
    </div>
  );
}
