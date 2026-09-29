"use client";

import { Button, Card, Confetti, Field, Input, Textarea, useToast } from "@repo/ui";
import { motion } from "motion/react";
import { ArrowLeft, Check, Gift } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { czk } from "@/lib/format";
import type { PublicSalon } from "@/lib/public-types";

const presets = [50000, 100000, 150000, 250000];

export function VoucherPurchase({ salon, success }: { salon: PublicSalon; success: boolean }) {
  const toast = useToast();
  const accent = salon.brand_color || "#3056d3";
  const [amount, setAmount] = useState(100000);
  const [custom, setCustom] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const value = custom ? Math.round(Number(custom.replace(",", ".")) * 100) : amount;
  const valid = Number.isFinite(value) && value >= 20000 && value <= 5000000 && (!email || /^\S+@\S+\.\S+$/.test(email));

  async function pay() {
    setBusy(true);
    try {
      const response = await fetch("/api/stripe/voucher", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: salon.slug, amount: value, recipientName: name, recipientEmail: email, message }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Platbu se nepodařilo spustit");
      window.location.assign(data.url);
    } catch (error) {
      toast.error("Nákup se nepodařil", (error as Error).message);
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg px-4">
        <Confetti />
        <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} className="grid max-w-md gap-4 text-center">
          <span className="mx-auto grid size-20 place-items-center rounded-full text-white shadow-xl" style={{ background: accent }}>
            <Check className="size-10" strokeWidth={3} />
          </span>
          <h1 className="text-3xl font-bold tracking-tight">Poukaz je na cestě</h1>
          <p className="text-fg-muted">Po potvrzení platby vám PDF s kódem pošleme e-mailem, případně rovnou obdarovanému.</p>
          <Button asChild variant="secondary">
            <Link href={`/s/${salon.slug}`}>Zpět na stránku salonu</Link>
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg pb-16">
      <div className="mx-auto max-w-xl px-4 py-6">
        <Link href={`/s/${salon.slug}`} className="inline-flex items-center gap-2 text-sm font-medium text-fg-muted hover:text-fg">
          <ArrowLeft className="size-4" /> {salon.name}
        </Link>
        <div className="mt-5 overflow-hidden rounded-3xl p-6 text-white shadow-xl" style={{ background: `linear-gradient(130deg, ${accent}, color-mix(in srgb, ${accent} 55%, #06b6d4))` }}>
          <Gift className="size-10 opacity-90" />
          <h1 className="mt-4 text-3xl font-bold tracking-tight">Dárkový poukaz</h1>
          <p className="mt-1 opacity-90">Darujte zážitek v salonu {salon.name}. Poukaz dorazí e-mailem hned po zaplacení.</p>
          <p className="mt-5 text-4xl font-bold">{Number.isFinite(value) ? czk(value) : "–"}</p>
        </div>

        <Card className="mt-5 grid gap-5 p-5">
          <div>
            <p className="mb-2 text-sm font-medium">Hodnota poukazu</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {presets.map((preset) => (
                <button key={preset} onClick={() => { setAmount(preset); setCustom(""); }} className={`h-12 rounded-xl border font-semibold transition ${!custom && amount === preset ? "border-transparent text-white shadow-md" : "border-border bg-surface hover:bg-surface-2"}`} style={!custom && amount === preset ? { background: accent } : undefined}>
                  {czk(preset)}
                </button>
              ))}
            </div>
            <Field label="Jiná částka (Kč)" className="mt-3" hint="Od 200 do 50 000 Kč">
              <Input inputMode="decimal" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="např. 1200" />
            </Field>
          </div>
          <Field label="Pro koho je poukaz" hint="Nepovinné, jméno se vytiskne na poukaz">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="Jméno obdarovaného" />
          </Field>
          <Field label="E-mail obdarovaného" hint="Poukaz mu pošleme přímo. Bez e-mailu ho dostanete vy.">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jmeno@email.cz" />
          </Field>
          <Field label="Věnování">
            <Textarea rows={3} maxLength={400} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Přeji ti krásný den…" />
          </Field>
          <Button size="lg" disabled={!valid} loading={busy} onClick={pay}>
            Zaplatit {valid ? czk(value) : ""}
          </Button>
          <p className="text-center text-xs text-fg-subtle">Platba probíhá zabezpečeně přes Stripe. Poukaz platí 12 měsíců.</p>
        </Card>
      </div>
    </div>
  );
}
