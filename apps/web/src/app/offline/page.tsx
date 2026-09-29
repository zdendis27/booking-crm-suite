import { WifiOff } from "lucide-react";
import { brand } from "@repo/copy";

export const metadata = { title: "Jste offline" };

export default function OfflinePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="grid size-16 place-items-center rounded-2xl bg-accent-soft text-accent">
        <WifiOff className="size-8" />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">Jste offline</h1>
      <p className="max-w-sm text-fg-muted">{brand.name} potřebuje připojení k internetu. Jakmile se připojíte, vše se samo obnoví.</p>
    </main>
  );
}
