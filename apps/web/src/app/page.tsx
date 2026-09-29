import { brand, cs } from "@repo/copy";
import { formatCzk } from "@repo/db";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="rounded-full bg-accent-soft px-4 py-1 text-sm font-medium text-accent">
        {brand.name}
      </span>
      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
        {cs.home.tagline}
      </h1>
      <p className="max-w-xl text-lg text-fg-muted">{cs.home.description}</p>
      <p className="text-sm text-fg-muted">
        Základ projektu běží. Ukázka formátu peněz: {formatCzk(89900)}
      </p>
    </main>
  );
}
