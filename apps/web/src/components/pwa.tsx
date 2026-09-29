"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@repo/ui";
import { registerServiceWorker } from "@/lib/push";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") registerServiceWorker().catch(() => null);
  }, []);
  return null;
}

export function InstallButton() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return <p className="text-sm text-fg-muted">Aplikace je nainstalovaná na tomto zařízení.</p>;
  if (!event) return <p className="text-sm text-fg-muted">Otevřete stránku v prohlížeči telefonu a zvolte „Přidat na plochu“.</p>;
  return (
    <Button
      variant="secondary"
      leading={<Download className="size-4" />}
      onClick={async () => {
        await event.prompt();
        await event.userChoice;
        setEvent(null);
      }}
    >
      Nainstalovat aplikaci
    </Button>
  );
}
