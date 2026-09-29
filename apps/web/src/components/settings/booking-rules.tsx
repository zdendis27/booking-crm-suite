"use client";

import { Badge, Button, Card, CardHeader, Field, Input, Select, Skeleton, Switch, cn, useToast } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CreditCard, Lock, Mail, Phone, Save, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSalon } from "@/components/app/salon-context";
import { czk } from "@/lib/format";
import { errorMessage, useSb } from "@/lib/data";

export function BookingRules() {
  const { salon, can, hasFeature } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const editable = can(["owner", "manager"]);
  const [policy, setPolicy] = useState<"email" | "email_phone">(salon.verification_policy);
  const [deposit, setDeposit] = useState({ enabled: false, mode: "percent", value: "30", onlyNew: true, minTotal: "0", refundable: "24" });
  const [busyStripe, setBusyStripe] = useState(false);

  const stripe = useQuery({
    queryKey: ["stripe-account", salon.id],
    queryFn: async () => (await sb.from("stripe_accounts").select("*").eq("salon_id", salon.id).maybeSingle()).data as { stripe_account_id: string; charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean } | null,
  });
  const policyQuery = useQuery({
    queryKey: ["deposit-policy", salon.id],
    queryFn: async () => (await sb.from("deposit_policies").select("*").eq("salon_id", salon.id).maybeSingle()).data as any,
  });

  useEffect(() => {
    const p = policyQuery.data;
    if (p) setDeposit({ enabled: p.enabled, mode: p.mode, value: String(p.mode === "fixed" ? p.value / 100 : p.value), onlyNew: p.only_new_clients, minTotal: String(p.min_total / 100), refundable: String(p.refundable_until_h) });
  }, [policyQuery.data]);

  const save = useMutation({
    mutationFn: async () => {
      const a = await sb.from("salons").update({ verification_policy: policy }).eq("id", salon.id);
      if (a.error) throw a.error;
      if (hasFeature("deposits")) {
        const b = await sb.from("deposit_policies").upsert({ salon_id: salon.id, enabled: deposit.enabled, mode: deposit.mode, value: deposit.mode === "fixed" ? Math.round(Number(deposit.value.replace(",", ".")) * 100) : Number(deposit.value), only_new_clients: deposit.onlyNew, min_total: Math.round(Number(deposit.minTotal.replace(",", ".") || 0) * 100), refundable_until_h: Number(deposit.refundable) }, { onConflict: "salon_id" });
        if (b.error) throw b.error;
      }
    },
    onSuccess: () => {
      toast.success("Pravidla uložena");
      qc.invalidateQueries({ queryKey: ["deposit-policy"] });
      router.refresh();
    },
    onError: (error) => toast.error("Uložení se nepodařilo", errorMessage(error)),
  });

  async function connectStripe() {
    setBusyStripe(true);
    try {
      const response = await fetch("/api/stripe/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ salonId: salon.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Stripe se nepodařilo spustit");
      window.location.assign(data.url);
    } catch (error) {
      toast.error("Propojení se Stripe se nepodařilo", (error as Error).message);
      setBusyStripe(false);
    }
  }

  if (policyQuery.isLoading) return <Skeleton className="h-96 rounded-lg" />;

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader title="Ověření zákazníka při rezervaci" description="Zákazník se přihlásí přes Google, Apple nebo e-mailový kód. Zde určíte, co všechno musí mít ověřené." />
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          {[
            { value: "email", label: "Stačí e-mail", hint: "Nejrychlejší rezervace, žádné SMS", icon: Mail, disabled: false },
            { value: "email_phone", label: "E-mail a telefon", hint: "SMS ověření telefonu bude brzy k dispozici", icon: Phone, disabled: true },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={!editable || option.disabled}
              onClick={() => setPolicy(option.value as "email")}
              className={cn("flex items-start gap-3 rounded-lg border p-4 text-left transition-all", policy === option.value ? "border-accent bg-accent-soft shadow-sm" : "border-border hover:border-border-strong", option.disabled && "cursor-not-allowed opacity-55")}
            >
              <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-md", policy === option.value ? "bg-accent text-white" : "bg-surface-2 text-fg-muted")}>
                <option.icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-semibold">{option.label}</span>
                <span className="text-sm text-fg-muted">{option.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Zálohy a ochrana proti no-show" description="Nový klient složí zálohu kartou. Termín se potvrdí po zaplacení." action={!hasFeature("deposits") && <Badge tone="pink"><Lock className="h-3 w-3" /> Tarif PRO</Badge>} />
        <div className={cn("grid gap-5 p-5", !hasFeature("deposits") && "pointer-events-none opacity-50")}>
          <div className="flex items-center justify-between gap-4 rounded-md border border-border p-4">
            <div>
              <p className="text-sm font-medium">Vyžadovat zálohu</p>
              <p className="text-xs text-fg-muted">Vyžaduje propojený Stripe účet.</p>
            </div>
            <Switch checked={deposit.enabled} disabled={!editable} onCheckedChange={(enabled) => setDeposit({ ...deposit, enabled })} label="Záloha" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Typ zálohy">
              <Select value={deposit.mode} disabled={!editable} onChange={(event) => setDeposit({ ...deposit, mode: event.target.value })}>
                <option value="percent">Procento z ceny</option>
                <option value="fixed">Pevná částka</option>
              </Select>
            </Field>
            <Field label={deposit.mode === "percent" ? "Výše zálohy (%)" : "Výše zálohy (Kč)"}>
              <Input inputMode="decimal" value={deposit.value} disabled={!editable} onChange={(event) => setDeposit({ ...deposit, value: event.target.value })} />
            </Field>
            <Field label="Minimální cena rezervace (Kč)" hint="Pod touto cenou se záloha nevyžaduje">
              <Input inputMode="decimal" value={deposit.minTotal} disabled={!editable} onChange={(event) => setDeposit({ ...deposit, minTotal: event.target.value })} />
            </Field>
            <Field label="Vratná při stornu do (hodin)">
              <Input type="number" min={0} value={deposit.refundable} disabled={!editable} onChange={(event) => setDeposit({ ...deposit, refundable: event.target.value })} />
            </Field>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-md border border-border p-4">
            <div>
              <p className="text-sm font-medium">Jen pro nové klienty</p>
              <p className="text-xs text-fg-muted">Stálým klientům se záloha nevyžaduje.</p>
            </div>
            <Switch checked={deposit.onlyNew} disabled={!editable} onCheckedChange={(onlyNew) => setDeposit({ ...deposit, onlyNew })} label="Jen noví klienti" />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Online platby (Stripe)" description="Peníze jdou přímo na váš účet, nikdy přes nás." />
        <div className="flex flex-wrap items-center gap-4 p-5">
          <span className={cn("flex h-12 w-12 items-center justify-center rounded-lg", stripe.data?.charges_enabled ? "bg-success-soft text-success" : "bg-surface-2 text-fg-muted")}>
            {stripe.data?.charges_enabled ? <CheckCircle2 className="h-6 w-6" /> : <CreditCard className="h-6 w-6" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{stripe.data?.charges_enabled ? "Stripe je propojený" : stripe.data ? "Dokončete registraci u Stripe" : "Stripe zatím není propojený"}</p>
            <p className="text-sm text-fg-muted">{stripe.data?.charges_enabled ? "Můžete přijímat zálohy a prodávat dárkové poukazy online." : "Po propojení můžete vyžadovat zálohy a prodávat poukazy online."}</p>
          </div>
          {editable && !stripe.data?.charges_enabled && (
            <Button onClick={connectStripe} loading={busyStripe} leading={<ShieldCheck className="h-4 w-4" />}>
              {stripe.data ? "Pokračovat" : "Propojit Stripe"}
            </Button>
          )}
        </div>
        {deposit.enabled && !stripe.data?.charges_enabled && <p className="border-t border-border bg-warning-soft px-5 py-3 text-sm text-warning">Záloha se nebude vyžadovat, dokud nedokončíte propojení Stripe.</p>}
      </Card>

      {editable && (
        <div className="sticky bottom-20 z-10 flex justify-end lg:bottom-4">
          <Button size="lg" loading={save.isPending} onClick={() => save.mutate()} leading={<Save className="h-[18px] w-[18px]" />} className="shadow-lg">
            Uložit pravidla
          </Button>
        </div>
      )}
      <p className="text-center text-xs text-fg-subtle">
        Pravidla storna a časové lhůty najdete u jednotlivých poboček v <Link href={`/app/${salon.slug}/nastaveni/pobocky`} className="text-accent">Pobočky a doba</Link>. Příklad zálohy: služba za {czk(90000)} a záloha 30 % je {czk(27000)}.
      </p>
    </div>
  );
}
