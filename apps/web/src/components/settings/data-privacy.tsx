"use client";

import { Button, Card, CardHeader, useToast } from "@repo/ui";
import { Download, FileText, Lock, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useSalon } from "@/components/app/salon-context";
import { downloadCsv, halereToCsv } from "@/lib/csv";
import { errorMessage, useSb } from "@/lib/data";

export function DataPrivacy() {
  const { salon, can } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const isMgmt = can(["owner", "manager"]);

  async function exportClients() {
    setBusy("clients");
    try {
      const { data, error } = await sb.from("clients").select("first_name,last_name,phone,email,birthday,created_at, stats:client_stats(visits_count,total_spent,last_visit_at)").eq("salon_id", salon.id).is("merged_into", null).is("anonymized_at", null).limit(20000);
      if (error) throw error;
      downloadCsv("klienti.csv", [
        ["Jméno", "Příjmení", "Telefon", "E-mail", "Datum narození", "Vytvořen", "Návštěvy", "Útrata (Kč)", "Poslední návštěva"],
        ...((data ?? []) as any[]).map((c) => {
          const s = Array.isArray(c.stats) ? c.stats[0] : c.stats;
          return [c.first_name, c.last_name, c.phone, c.email, c.birthday, c.created_at?.slice(0, 10), s?.visits_count ?? 0, halereToCsv(s?.total_spent ?? 0), s?.last_visit_at?.slice(0, 10) ?? ""];
        }),
      ]);
    } catch (error) {
      toast.error("Export se nepodařil", errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function exportBookings() {
    setBusy("bookings");
    try {
      const { data, error } = await sb.from("bookings").select("starts_at,status,source,price_total,discount_total,products_total, clients(full_name), booking_items(name_snap)").eq("salon_id", salon.id).order("starts_at", { ascending: false }).limit(20000);
      if (error) throw error;
      downloadCsv("rezervace.csv", [
        ["Začátek", "Klient", "Služby", "Stav", "Zdroj", "Cena (Kč)", "Sleva (Kč)", "Zboží (Kč)"],
        ...((data ?? []) as any[]).map((b) => [b.starts_at, b.clients?.full_name, b.booking_items.map((i: any) => i.name_snap).join(", "), b.status, b.source, halereToCsv(b.price_total), halereToCsv(b.discount_total), halereToCsv(b.products_total)]),
      ]);
    } catch (error) {
      toast.error("Export se nepodařil", errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader title="Export dat" description="Vaše data patří vám. Kdykoli je můžete stáhnout." />
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          <Button variant="secondary" disabled={!isMgmt} loading={busy === "clients"} onClick={exportClients} leading={<Users className="h-4 w-4" />} className="justify-start">
            Export klientů (CSV)
          </Button>
          <Button variant="secondary" disabled={!isMgmt} loading={busy === "bookings"} onClick={exportBookings} leading={<Download className="h-4 w-4" />} className="justify-start">
            Export rezervací (CSV)
          </Button>
        </div>
        <p className="border-t border-border px-5 py-3 text-xs text-fg-subtle">Faktury a platby exportujete pro účetní v sekcích Faktury a Finance.</p>
      </Card>

      <Card>
        <CardHeader title="GDPR a ochrana osobních údajů" description="Vy jste správce osobních údajů svých klientů, my jsme zpracovatel." />
        <ul className="divide-y divide-border p-2 text-sm">
          {[
            { icon: ShieldCheck, title: "Souhlasy s marketingem", text: "Zaznamenávají se u každého klienta včetně data a zdroje. Odhlášení je součástí každého e-mailu." },
            { icon: Lock, title: "Anonymizace klienta", text: "V profilu klienta (Další akce) lze na žádost odstranit osobní údaje. Doklady a tržby zůstanou pro účetnictví." },
            { icon: FileText, title: "Smlouva o zpracování", text: "Zpracovatelská smlouva a zásady ochrany osobních údajů jsou k dispozici na stránkách níže." },
          ].map((row) => (
            <li key={row.title} className="flex items-start gap-4 px-3 py-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                <row.icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-medium">{row.title}</span>
                <span className="text-fg-muted">{row.text}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-4 border-t border-border px-5 py-4 text-sm">
          <Link href="/pravni/soukromi" className="text-accent hover:underline">Zásady ochrany osobních údajů</Link>
          <Link href="/pravni/zpracovani" className="text-accent hover:underline">Zpracovatelská smlouva</Link>
          <Link href="/pravni/podminky" className="text-accent hover:underline">Obchodní podmínky</Link>
        </div>
      </Card>
    </div>
  );
}
