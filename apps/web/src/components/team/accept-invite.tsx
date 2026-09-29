"use client";

import { brand } from "@repo/copy";
import { Button, Illustration, Logo } from "@repo/ui";
import { CheckCircle2, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "anonymous" | "ready" | "done" | "error">("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    getSupabase()
      .auth.getUser()
      .then(({ data }) => setState(data.user ? "ready" : "anonymous"));
  }, []);

  async function accept() {
    setState("checking");
    const { data, error } = await getSupabase().rpc("accept_invite", { p_token: token });
    if (error) {
      setState("error");
      setMessage(
        error.message.includes("invite_email_mismatch")
          ? "Pozvánka patří jinému e-mailu. Přihlaste se e-mailem, na který byla odeslána."
          : error.message.includes("invite_invalid")
            ? "Pozvánka je neplatná nebo vypršela."
            : error.message,
      );
      return;
    }
    const { data: salon } = await getSupabase().from("salons").select("slug").eq("id", data as string).single();
    setState("done");
    setTimeout(() => router.replace(`/app/${salon?.slug ?? ""}`), 1200);
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center px-5">
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-80 [background:var(--gradient-mesh)]" />
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 text-center shadow-md">
        <Logo name={brand.name} className="mb-6 justify-center" />
        <div className="flex justify-center">
          <Illustration icon={state === "done" ? CheckCircle2 : Mail} tone={state === "done" ? "success" : "accent"} size={110} />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">{state === "done" ? "Vítejte v týmu" : "Pozvánka do salonu"}</h1>
        {state === "anonymous" && (
          <>
            <p className="mt-2 text-fg-muted">Nejdřív se přihlaste e-mailem, na který pozvánka přišla.</p>
            <Button className="mt-6 w-full" size="lg" onClick={() => router.push(`/prihlaseni?next=${encodeURIComponent(`/pozvanka/${token}`)}`)}>
              Přihlásit se
            </Button>
          </>
        )}
        {state === "ready" && (
          <>
            <p className="mt-2 text-fg-muted">Přijetím získáte přístup do aplikace salonu.</p>
            <Button className="mt-6 w-full" size="lg" onClick={accept}>
              Přijmout pozvánku
            </Button>
          </>
        )}
        {state === "checking" && <p className="mt-2 text-fg-muted">Chvilku strpení…</p>}
        {state === "error" && <p className="mt-3 rounded-md bg-danger-soft px-3 py-2.5 text-sm text-danger">{message}</p>}
        {state === "done" && <p className="mt-2 text-fg-muted">Přesměrovávám vás do aplikace…</p>}
      </div>
    </div>
  );
}
