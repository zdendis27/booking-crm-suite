"use client";

import { brand, templates } from "@repo/copy";
import { Button, Confetti, Field, Input, Logo, cn, useDebounced } from "@repo/ui";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Brush, Check, Eye, Flower2, Hand, HeartHandshake, Loader2, PartyPopper, PenTool, Scissors, Store, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { slugify } from "@/lib/format";

const templateIcons: Record<string, typeof Scissors> = {
  barber: Scissors,
  hair: Brush,
  nails: Hand,
  lashes: Eye,
  cosmetics: Flower2,
  massage: HeartHandshake,
  tattoo: PenTool,
};

const steps = ["Salon", "Obor", "Kontakt"];

function errorText(message: string): string {
  if (message.includes("slug_taken")) return "Tato adresa je už obsazená.";
  if (message.includes("slug_reserved")) return "Tato adresa je vyhrazená.";
  if (message.includes("invalid_slug")) return "Adresa může obsahovat malá písmena, čísla a pomlčky (3–40 znaků).";
  if (message.includes("too_many_salons")) return "Dosáhli jste maximálního počtu salonů.";
  return message;
}

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [template, setTemplate] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const debouncedSlug = useDebounced(slug, 350);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  useEffect(() => {
    if (debouncedSlug.length < 3) {
      setAvailable(null);
      return;
    }
    let cancelled = false;
    setChecking(true);
    getSupabase()
      .rpc("slug_available", { p_slug: debouncedSlug })
      .then(({ data }) => {
        if (!cancelled) {
          setAvailable(data === true);
          setChecking(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSlug]);

  const canContinue = step === 0 ? name.trim().length >= 2 && slug.length >= 3 && available === true : step === 1 ? true : true;

  async function create() {
    setBusy(true);
    setError(null);
    const { error: failure } = await getSupabase().rpc("create_salon", {
      p_name: name.trim(),
      p_slug: slug,
      p_location_name: "Hlavní pobočka",
      p_template: template ?? undefined,
      p_phone: phone || undefined,
      p_street: street || undefined,
      p_city: city || undefined,
      p_zip: zip || undefined,
    });
    if (failure) {
      setBusy(false);
      setError(errorText(failure.message));
      return;
    }
    setDone(slug);
    setTimeout(() => {
      router.replace(`/app/${slug}`);
      router.refresh();
    }, 2600);
  }

  if (done) {
    return (
      <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-6">
        <div className="pointer-events-none absolute inset-0 opacity-80 [background:var(--gradient-mesh)]" />
        <div className="relative text-center">
          <Confetti />
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 14 }}
            className="mx-auto flex h-24 w-24 items-center justify-center rounded-[28px] bg-[image:var(--gradient-brand)] text-white shadow-glow"
          >
            <PartyPopper className="h-11 w-11" />
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="mt-8 text-3xl font-semibold tracking-tight">
            Salon je připravený
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-2 text-fg-muted">
            Přesměrovávám vás do aplikace…
          </motion.p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh px-5 py-8 sm:py-12">
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-80 [background:var(--gradient-mesh)]" />
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center justify-between">
          <Logo name={brand.name} />
          <Button variant="ghost" size="sm" onClick={() => router.push("/app")}>
            Zrušit
          </Button>
        </div>

        <div className="mb-8 flex items-center gap-3">
          {steps.map((label, index) => (
            <div key={label} className="flex flex-1 items-center gap-3">
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all duration-300",
                    index < step ? "bg-success text-white" : index === step ? "bg-[image:var(--gradient-brand)] text-white shadow-glow" : "bg-surface-3 text-fg-subtle",
                  )}
                >
                  {index < step ? <Check className="h-4 w-4" strokeWidth={3} /> : index + 1}
                </span>
                <span className={cn("hidden text-sm font-medium sm:block", index === step ? "text-fg" : "text-fg-subtle")}>{label}</span>
              </div>
              {index < steps.length - 1 && <div className="h-0.5 flex-1 overflow-hidden rounded-full bg-surface-3"><motion.div className="h-full bg-[image:var(--gradient-brand)]" animate={{ width: index < step ? "100%" : "0%" }} transition={{ duration: 0.4 }} /></div>}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 shadow-md sm:p-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {step === 0 && (
                <div className="grid gap-6">
                  <div>
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-accent-soft text-accent">
                      <Store className="h-6 w-6" />
                    </div>
                    <h1 className="text-2xl font-semibold tracking-tight">Jak se váš salon jmenuje?</h1>
                    <p className="mt-1.5 text-fg-muted">Podle názvu vytvoříme i adresu vaší rezervační stránky.</p>
                  </div>
                  <Field label="Název salonu" required>
                    <Input inputSize="lg" placeholder="Např. Barber Praha" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
                  </Field>
                  <Field
                    label="Adresa rezervační stránky"
                    hint={slug.length >= 3 ? undefined : "Minimálně 3 znaky"}
                    error={available === false && slug.length >= 3 ? "Tato adresa není dostupná, zkuste jinou." : undefined}
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        inputSize="lg"
                        value={slug}
                        onChange={(event) => {
                          setSlugTouched(true);
                          setSlug(slugify(event.target.value));
                        }}
                        invalid={available === false}
                        trailing={checking ? <Loader2 className="animate-spin" /> : available ? <Check className="text-success" /> : available === false ? <X className="text-danger" /> : null}
                      />
                    </div>
                    <p className="text-xs text-fg-subtle">
                      Zákazníci najdou salon na <span className="font-medium text-fg">{brand.baseDomain}/s/{slug || "vas-salon"}</span>
                    </p>
                  </Field>
                </div>
              )}

              {step === 1 && (
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">Čemu se věnujete?</h1>
                  <p className="mt-1.5 text-fg-muted">Připravíme vám základní ceník, který si můžete kdykoli upravit. Nebo začněte od nuly.</p>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    {templates.map((item) => {
                      const Icon = templateIcons[item.id] ?? Scissors;
                      const selected = template === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setTemplate(selected ? null : item.id)}
                          className={cn(
                            "group flex items-start gap-3.5 rounded-lg border p-4 text-left transition-all duration-200",
                            selected ? "border-accent bg-accent-soft shadow-glow" : "border-border hover:-translate-y-0.5 hover:border-border-strong hover:shadow-sm",
                          )}
                        >
                          <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition-colors", selected ? "bg-[image:var(--gradient-brand)] text-white" : "bg-surface-2 text-accent")}>
                            <Icon className="h-5 w-5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block font-semibold">{item.label}</span>
                            <span className="block text-sm text-fg-muted">{item.description}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="grid gap-5">
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Kde vás najdou?</h1>
                    <p className="mt-1.5 text-fg-muted">Údaje se zobrazí na vaší stránce. Vše můžete později změnit.</p>
                  </div>
                  <Field label="Telefon">
                    <Input inputSize="lg" type="tel" placeholder="+420 777 123 456" value={phone} onChange={(event) => setPhone(event.target.value)} />
                  </Field>
                  <Field label="Ulice a číslo">
                    <Input inputSize="lg" placeholder="Náměstí Míru 12" value={street} onChange={(event) => setStreet(event.target.value)} />
                  </Field>
                  <div className="grid grid-cols-[1fr_8rem] gap-3">
                    <Field label="Město">
                      <Input inputSize="lg" placeholder="Praha" value={city} onChange={(event) => setCity(event.target.value)} />
                    </Field>
                    <Field label="PSČ">
                      <Input inputSize="lg" placeholder="120 00" value={zip} onChange={(event) => setZip(event.target.value)} />
                    </Field>
                  </div>
                  {error && <p className="rounded-md bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-8 flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 0 || busy} leading={<ArrowLeft className="h-4 w-4" />}>
              Zpět
            </Button>
            {step < steps.length - 1 ? (
              <Button size="lg" onClick={() => setStep(step + 1)} disabled={!canContinue} trailing={<ArrowRight className="h-4 w-4" />}>
                Pokračovat
              </Button>
            ) : (
              <Button size="lg" onClick={create} loading={busy} trailing={<Check className="h-4 w-4" />}>
                Založit salon
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
