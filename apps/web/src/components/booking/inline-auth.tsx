"use client";

import { Button, Field, Input, useToast } from "@repo/ui";
import type { User } from "@supabase/supabase-js";
import { ArrowLeft, Mail, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { OtpInput } from "@/components/auth/otp-input";

export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  return { user, ready };
}

function czechError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("rate limit") || text.includes("too many")) return "Příliš mnoho pokusů. Zkuste to prosím za chvíli.";
  if (text.includes("expired") || text.includes("invalid")) return "Kód je neplatný nebo vypršel.";
  if (text.includes("provider is not enabled") || text.includes("unsupported provider")) return "Toto přihlášení zatím není zapnuté.";
  return message;
}

export function InlineAuth({ onBeforeRedirect, next, title = "Přihlaste se e-mailem" }: { onBeforeRedirect?: () => void; next: string; title?: string }) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /^\S+@\S+\.\S+$/.test(email.trim());

  async function send() {
    setBusy(true);
    setError(null);
    const { error: failure } = await getSupabase().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setBusy(false);
    if (failure) {
      setError(czechError(failure.message));
      return;
    }
    setStep("code");
    setCode("");
  }

  async function verify(value: string) {
    setBusy(true);
    setError(null);
    const { error: failure } = await getSupabase().auth.verifyOtp({ email: email.trim().toLowerCase(), token: value, type: "email" });
    setBusy(false);
    if (failure) {
      setError(czechError(failure.message));
      setCode("");
      return;
    }
    toast.success("Jste přihlášeni");
  }

  async function oauth(provider: "google" | "apple") {
    onBeforeRedirect?.();
    const { error: failure } = await getSupabase().auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` } });
    if (failure) setError(czechError(failure.message));
  }

  return (
    <div className="grid gap-4 rounded-2xl border border-border bg-surface-2/60 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent">
          <ShieldCheck className="size-5" />
        </span>
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-fg-muted">Účet vám vznikne automaticky, žádné heslo není potřeba.</p>
        </div>
      </div>
      {step === "email" ? (
        <>
          <Field label="E-mail" error={error}>
            <Input type="email" autoComplete="email" inputMode="email" placeholder="vas@email.cz" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && valid && send()} leading={<Mail className="size-4" />} />
          </Field>
          <Button disabled={!valid} loading={busy} onClick={send}>
            Poslat přihlašovací kód
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => oauth("google")}>
              Google
            </Button>
            <Button variant="secondary" onClick={() => oauth("apple")}>
              Apple
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-fg-muted">
            Poslali jsme 6místný kód na <strong className="text-fg">{email}</strong>.
          </p>
          <OtpInput value={code} onChange={setCode} onComplete={verify} disabled={busy} invalid={!!error} />
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button variant="ghost" size="sm" onClick={() => setStep("email")} leading={<ArrowLeft className="size-4" />} className="justify-self-start">
            Jiný e-mail
          </Button>
        </>
      )}
    </div>
  );
}
