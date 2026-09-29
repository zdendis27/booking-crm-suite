"use client";

import { brand } from "@repo/copy";
import { Button, Field, Input, Logo, SegmentedControl, useToast } from "@repo/ui";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, CalendarCheck, KeyRound, Mail, Sparkles, Users, Wallet } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { OtpInput } from "./otp-input";

type Mode = "code" | "password";
type Step = "email" | "code";

function czechError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("rate limit") || text.includes("too many")) return "Příliš mnoho pokusů. Zkuste to prosím za chvíli.";
  if (text.includes("invalid login") || text.includes("invalid credentials")) return "Nesprávný e-mail nebo heslo.";
  if (text.includes("expired") || text.includes("invalid")) return "Kód je neplatný nebo vypršel.";
  if (text.includes("provider is not enabled") || text.includes("unsupported provider")) return "Toto přihlášení zatím není v nastavení zapnuté.";
  if (text.includes("email not confirmed")) return "E-mail ještě není potvrzený. Podívejte se do schránky.";
  if (text.includes("already registered")) return "Tento e-mail už je zaregistrovaný, zkuste se přihlásit.";
  if (text.includes("password")) return "Heslo musí mít alespoň 8 znaků.";
  return message;
}

function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/app";
}

const highlights = [
  { icon: CalendarCheck, title: "Rezervace 24/7", text: "Klienti se objednávají sami, bez instalace." },
  { icon: Sparkles, title: "Systém pracuje za vás", text: "Připomínky, vracení klientů a follow-upy automaticky." },
  { icon: Wallet, title: "Platby a faktury", text: "Tržby, pokladna a české doklady na jednom místě." },
  { icon: Users, title: "Klienti a věrnost", text: "Historie, poznámky a věrnostní program." },
];

export function LoginForm({ demo = false }: { demo?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<Mode>("code");
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [signup, setSignup] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    const failure = params.get("chyba");
    if (failure) setError(failure);
  }, [params]);

  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function sendCode() {
    setBusy(true);
    setError(null);
    const { error: failure } = await getSupabase().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true, emailRedirectTo: redirectTo() },
    });
    setBusy(false);
    if (failure) {
      setError(czechError(failure.message));
      return;
    }
    setStep("code");
    setCode("");
    setCooldown(45);
  }

  async function verifyCode(value: string) {
    setBusy(true);
    setError(null);
    const { error: failure } = await getSupabase().auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: value,
      type: "email",
    });
    if (failure) {
      setBusy(false);
      setError(czechError(failure.message));
      setCode("");
      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function submitPassword() {
    setBusy(true);
    setError(null);
    const supabase = getSupabase();
    if (signup) {
      const { data, error: failure } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { emailRedirectTo: redirectTo() },
      });
      setBusy(false);
      if (failure) {
        setError(czechError(failure.message));
        return;
      }
      if (!data.session) {
        toast.info("Zkontrolujte e-mail", "Poslali jsme vám odkaz pro potvrzení registrace.");
        return;
      }
    } else {
      const { error: failure } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      setBusy(false);
      if (failure) {
        setError(czechError(failure.message));
        return;
      }
    }
    router.replace(next);
    router.refresh();
  }

  async function oauth(provider: "google" | "apple") {
    setError(null);
    const { error: failure } = await getSupabase().auth.signInWithOAuth({ provider, options: { redirectTo: redirectTo() } });
    if (failure) setError(czechError(failure.message));
  }

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[image:var(--gradient-brand)] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-[28rem] w-[28rem] rounded-full bg-black/10 blur-3xl" />
        <Logo name={brand.name} className="relative [&_span:last-child]:text-white" />
        <div className="relative max-w-md">
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-4xl font-semibold leading-tight tracking-tight"
          >
            Operační systém pro váš salon
          </motion.h2>
          <p className="mt-4 text-lg text-white/80">Rezervace, klienti, platby a připomínky. Všechno na jednom místě a bez zbytečné práce.</p>
          <ul className="mt-10 space-y-5">
            {highlights.map((item, index) => (
              <motion.li
                key={item.title}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + index * 0.1, duration: 0.5 }}
                className="flex items-start gap-4"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-white/15 backdrop-blur">
                  <item.icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-semibold">{item.title}</span>
                  <span className="text-sm text-white/75">{item.text}</span>
                </span>
              </motion.li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/60">© {new Date().getFullYear()} {brand.name}</p>
      </aside>

      <main className="relative flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-70 [background:var(--gradient-mesh)] lg:hidden" />
        <div className="w-full max-w-md">
          <Logo name={brand.name} className="mb-8 lg:hidden" />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step + mode}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {step === "code" && mode === "code" ? (
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setStep("email");
                      setError(null);
                    }}
                    className="mb-6 inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
                  >
                    <ArrowLeft className="h-4 w-4" /> Zpět
                  </button>
                  <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <Mail className="h-7 w-7" />
                  </div>
                  <h1 className="text-2xl font-semibold tracking-tight">Zadejte kód z e-mailu</h1>
                  <p className="mt-2 text-fg-muted">
                    Poslali jsme ho na <span className="font-medium text-fg">{email}</span>. Můžete také kliknout na odkaz v e-mailu.
                  </p>
                  <div className="mt-8">
                    <OtpInput value={code} onChange={setCode} onComplete={verifyCode} disabled={busy} invalid={!!error} />
                  </div>
                  {error && <p className="mt-4 text-center text-sm text-danger">{error}</p>}
                  <Button className="mt-8 w-full" size="lg" loading={busy} disabled={code.length < 6} onClick={() => verifyCode(code)}>
                    Přihlásit se
                  </Button>
                  <p className="mt-5 text-center text-sm text-fg-muted">
                    Kód nedorazil?{" "}
                    <button
                      type="button"
                      disabled={cooldown > 0 || busy}
                      onClick={sendCode}
                      className="font-medium text-accent disabled:cursor-not-allowed disabled:text-fg-subtle"
                    >
                      {cooldown > 0 ? `Poslat znovu za ${cooldown} s` : "Poslat znovu"}
                    </button>
                  </p>
                </div>
              ) : (
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight">{signup ? "Vytvořit účet" : "Vítejte zpět"}</h1>
                  <p className="mt-2 text-fg-muted">
                    {signup ? "Zaregistrujte se a založte si svůj salon nebo se objednávejte." : "Přihlaste se do svého salonu nebo zákaznického účtu."}
                  </p>

                  <div className="mt-8 grid gap-3">
                    <Button variant="secondary" size="lg" onClick={() => oauth("google")} leading={<GoogleIcon />}>
                      Pokračovat přes Google
                    </Button>
                    <Button variant="secondary" size="lg" onClick={() => oauth("apple")} leading={<AppleIcon />}>
                      Pokračovat přes Apple
                    </Button>
                  </div>

                  <div className="my-7 flex items-center gap-4 text-xs uppercase tracking-wider text-fg-subtle">
                    <span className="h-px flex-1 bg-border" />
                    nebo e-mailem
                    <span className="h-px flex-1 bg-border" />
                  </div>

                  <SegmentedControl
                    className="mb-5 w-full [&>button]:flex-1"
                    value={mode}
                    onChange={(value) => {
                      setMode(value);
                      setError(null);
                    }}
                    options={[
                      { value: "code", label: "Kód e-mailem" },
                      { value: "password", label: "Heslo" },
                    ]}
                  />

                  <form
                    className="grid gap-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (mode === "code") sendCode();
                      else submitPassword();
                    }}
                  >
                    <Field label="E-mail">
                      <Input
                        type="email"
                        inputSize="lg"
                        autoComplete="email"
                        placeholder="vas@email.cz"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        leading={<Mail />}
                        required
                      />
                    </Field>
                    {mode === "password" && (
                      <Field label="Heslo" hint={signup ? "Alespoň 8 znaků" : undefined}>
                        <Input
                          type="password"
                          inputSize="lg"
                          autoComplete={signup ? "new-password" : "current-password"}
                          placeholder="••••••••"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          leading={<KeyRound />}
                          required
                          minLength={8}
                        />
                      </Field>
                    )}
                    {error && (
                      <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="rounded-md bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
                        {error}
                      </motion.p>
                    )}
                    <Button type="submit" size="lg" loading={busy} disabled={!validEmail || (mode === "password" && password.length < 8)}>
                      {mode === "code" ? "Poslat přihlašovací kód" : signup ? "Vytvořit účet" : "Přihlásit se"}
                    </Button>
                  </form>

                  {mode === "password" && (
                    <p className="mt-5 text-center text-sm text-fg-muted">
                      {signup ? "Už máte účet?" : "Nemáte účet?"}{" "}
                      <button type="button" onClick={() => setSignup(!signup)} className="font-medium text-accent">
                        {signup ? "Přihlásit se" : "Zaregistrovat se"}
                      </button>
                    </p>
                  )}
                  {demo && (
                    <a
                      href={`/auth/demo?next=${encodeURIComponent(next)}`}
                      className="mt-5 flex items-center justify-center gap-2 rounded-md border border-dashed border-accent/50 bg-accent-soft/60 px-4 py-3 text-sm font-medium text-accent transition-colors hover:bg-accent-soft"
                    >
                      <Sparkles className="h-4 w-4" /> Vstoupit do demo salonu (jen pro vývoj)
                    </a>
                  )}
                  {mode === "code" && (
                    <p className="mt-5 text-center text-xs text-fg-subtle">
                      Nový účet se vytvoří automaticky. Pokračováním souhlasíte s obchodními podmínkami a zpracováním osobních údajů.
                    </p>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h5.9a5.04 5.04 0 0 1-2.19 3.31v2.75h3.54c2.07-1.9 3.25-4.72 3.25-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.54-2.75c-.98.66-2.24 1.06-3.74 1.06-2.87 0-5.3-1.94-6.17-4.55H2.17v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.83 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.17a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.65l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.17 7.06l3.66 2.84C6.7 7.32 9.13 5.38 12 5.38z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
      <path d="M16.37 1.43c0 1.14-.42 2.2-1.24 3.08-.83.9-1.94 1.42-3.07 1.33-.05-1.1.4-2.2 1.2-3 .84-.86 2.02-1.4 3.11-1.41zM20.5 17.3c-.57 1.3-.85 1.88-1.58 3.03-1.03 1.6-2.48 3.6-4.28 3.62-1.6.02-2.01-1.04-4.18-1.03-2.17.01-2.62 1.05-4.22 1.04-1.8-.02-3.18-1.82-4.2-3.42C-.66 16.3-.96 11 1.7 8.06c1.28-1.5 3.3-2.38 5.2-2.38 1.93 0 3.14 1.06 4.74 1.06 1.55 0 2.5-1.06 4.73-1.06 1.69 0 3.48.92 4.76 2.5-4.18 2.3-3.5 8.28.6 9.12z" />
    </svg>
  );
}
