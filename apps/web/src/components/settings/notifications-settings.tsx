"use client";

import { Badge, Button, Card, CardHeader, useToast } from "@repo/ui";
import { useQuery } from "@tanstack/react-query";
import { Bell, BellOff, BellRing, Mail, MessageSquare, Send, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { useSalon } from "@/components/app/salon-context";
import { InstallButton } from "@/components/pwa";
import { enablePush, pushSupported } from "@/lib/push";
import { useSb } from "@/lib/data";

export function NotificationsSettings() {
  const { salon, limits } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported()) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
    navigator.serviceWorker.getRegistration("/sw.js").then((registration) => registration?.pushManager.getSubscription().then((sub) => setSubscribed(!!sub)));
  }, []);

  const balance = useQuery({
    queryKey: ["sms-balance", salon.id],
    queryFn: async () => Number((await sb.rpc("salon_sms_balance", { p_salon: salon.id })).data ?? 0),
  });

  async function enable() {
    setBusy(true);
    try {
      await enablePush();
      setSubscribed(true);
      setPermission("granted");
      toast.success("Upozornění zapnuta", "Na tomto zařízení budete dostávat nové rezervace.");
    } catch (error) {
      toast.error("Upozornění se nepodařilo zapnout", (error as Error).message);
      if (pushSupported()) setPermission(Notification.permission);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    const response = await fetch("/api/push/test", { method: "POST" });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) toast.error("Zkušební upozornění selhalo", data.error);
    else toast.success("Odesláno", "Za okamžik by mělo dorazit.");
  }

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader title="Upozornění na tomto zařízení" description="Nová rezervace nebo zrušení se ukáže i mimo aplikaci." />
        <div className="flex flex-wrap items-center gap-4 p-5">
          <span className={`flex h-12 w-12 items-center justify-center rounded-lg ${subscribed ? "bg-success-soft text-success" : "bg-surface-2 text-fg-muted"}`}>
            {subscribed ? <BellRing className="h-6 w-6" /> : permission === "denied" || permission === "unsupported" ? <BellOff className="h-6 w-6" /> : <Bell className="h-6 w-6" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{subscribed ? "Upozornění jsou zapnutá" : permission === "denied" ? "Upozornění jsou v prohlížeči zablokovaná" : permission === "unsupported" ? "Toto zařízení upozornění nepodporuje" : "Upozornění jsou vypnutá"}</p>
            <p className="text-sm text-fg-muted">
              {permission === "unsupported" ? "Na iPhonu nejdřív přidejte aplikaci na plochu (Sdílet, Přidat na plochu)." : permission === "denied" ? "Povolte je v nastavení prohlížeče u této stránky." : "Funguje v Chrome, Edge, Firefoxu i Safari. Na iPhonu po přidání na plochu."}
            </p>
          </div>
          {!subscribed && permission !== "unsupported" && permission !== "denied" && (
            <Button loading={busy} onClick={enable} leading={<Smartphone className="h-4 w-4" />}>
              Zapnout na tomto zařízení
            </Button>
          )}
          {subscribed && (
            <Button variant="secondary" loading={busy} onClick={test} leading={<Send className="h-4 w-4" />}>
              Poslat zkušební upozornění
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Aplikace v telefonu" description="Terminio funguje jako aplikace na ploše, s ikonou a na celou obrazovku." />
        <div className="p-5">
          <InstallButton />
        </div>
      </Card>

      <Card>
        <CardHeader title="Kanály komunikace" description="Jak systém komunikuje s vašimi klienty." />
        <ul className="divide-y divide-border p-2">
          {[
            { icon: Mail, title: "E-mail", text: "Potvrzení, připomínky, poděkování a kampaně. Výchozí kanál.", badge: <Badge tone="success" dot>Aktivní</Badge> },
            { icon: Smartphone, title: "Push notifikace", text: "Pro klienty s účtem a nainstalovanou aplikací (PWA) a pro váš tým.", badge: <Badge tone="success" dot>Aktivní</Badge> },
            { icon: MessageSquare, title: "SMS", text: limits.sms_included > 0 ? `V tarifu ${limits.sms_included} SMS měsíčně, zbývá ${balance.data ?? 0}.` : "SMS upozornění jsou součástí vyšších tarifů.", badge: limits.sms_included > 0 ? <Badge tone="info">{balance.data ?? 0} zbývá</Badge> : <Badge>Není v tarifu</Badge> },
          ].map((row) => (
            <li key={row.title} className="flex items-center gap-4 px-3 py-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-md bg-accent-soft text-accent">
                <row.icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{row.title}</span>
                <span className="text-sm text-fg-muted">{row.text}</span>
              </span>
              {row.badge}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
