import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BellOff, Check, ShieldAlert } from "lucide-react";
import { verifyToken } from "@/lib/server/tokens";
import { createSupabaseAdmin } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Odhlášení z nabídek", robots: { index: false } };

async function unsubscribe(formData: FormData) {
  "use server";
  const client = String(formData.get("c") ?? "");
  const token = String(formData.get("t") ?? "");
  if (!client || !verifyToken(client, token)) return;
  await createSupabaseAdmin().rpc("unsubscribe_client_marketing", { p_client: client });
  redirect(`/odhlasit?c=${client}&t=${token}&hotovo=1`);
}

export default async function UnsubscribePage({ searchParams }: PageProps<"/odhlasit">) {
  const query = await searchParams;
  const client = typeof query.c === "string" ? query.c : "";
  const token = typeof query.t === "string" ? query.t : "";
  const valid = !!client && !!token && verifyToken(client, token);
  const done = query.hotovo === "1";

  return (
    <main className="grid min-h-screen place-items-center bg-bg px-4">
      <div className="grid max-w-md gap-4 text-center">
        <span className={`mx-auto grid size-16 place-items-center rounded-2xl ${done ? "bg-success-soft text-success" : valid ? "bg-accent-soft text-accent" : "bg-danger-soft text-danger"}`}>{done ? <Check className="size-8" /> : valid ? <BellOff className="size-8" /> : <ShieldAlert className="size-8" />}</span>
        {done ? (
          <>
            <h1 className="text-2xl font-bold tracking-tight">Odhlášeno</h1>
            <p className="text-fg-muted">Marketingová sdělení už vám posílat nebudeme. Potvrzení rezervací a připomínky termínů dostanete dál.</p>
          </>
        ) : valid ? (
          <>
            <h1 className="text-2xl font-bold tracking-tight">Odhlásit z nabídek?</h1>
            <p className="text-fg-muted">Přestaneme vám posílat novinky, narozeninové nabídky a připomínky k další návštěvě. Důležité zprávy k rezervacím zůstanou.</p>
            <form action={unsubscribe}>
              <input type="hidden" name="c" value={client} />
              <input type="hidden" name="t" value={token} />
              <button type="submit" className="h-12 w-full rounded-xl bg-[image:var(--gradient-brand)] font-semibold text-white shadow-glow transition active:scale-95">
                Odhlásit
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight">Odkaz není platný</h1>
            <p className="text-fg-muted">Použijte prosím odkaz z posledního e-mailu, nebo se odhlaste v nastavení účtu.</p>
          </>
        )}
        <Link href="/" className="text-sm font-medium text-fg-muted hover:text-fg">
          Na úvodní stránku
        </Link>
      </div>
    </main>
  );
}
