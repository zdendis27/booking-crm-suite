import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@repo/ui";
import { brand } from "@repo/copy";
import { legalDocs } from "@/lib/legal";

export function generateStaticParams() {
  return Object.keys(legalDocs).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: PageProps<"/pravni/[doc]">): Promise<Metadata> {
  const { doc } = await params;
  return { title: legalDocs[doc]?.title ?? "Dokument" };
}

export default async function LegalPage({ params }: PageProps<"/pravni/[doc]">) {
  const { doc } = await params;
  const content = legalDocs[doc];
  if (!content) notFound();
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/">
            <Logo name={brand.name} size={26} />
          </Link>
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-fg-muted hover:text-fg">
            <ArrowLeft className="size-4" /> Zpět
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{content.title}</h1>
        <p className="mt-2 text-sm text-fg-muted">Platné od {content.updated}</p>
        <p className="mt-6 text-lg leading-relaxed text-fg-muted">{content.intro}</p>
        <div className="mt-8 grid gap-8">
          {content.sections.map((section, index) => (
            <section key={section.heading}>
              <h2 className="text-xl font-semibold tracking-tight">
                {index + 1}. {section.heading}
              </h2>
              <div className="mt-3 grid gap-3 leading-relaxed text-fg-muted">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
        <nav className="mt-12 flex flex-wrap gap-4 border-t border-border pt-6 text-sm">
          {Object.entries(legalDocs).map(([key, value]) => (
            <Link key={key} href={`/pravni/${key}`} className={key === doc ? "font-semibold text-fg" : "text-fg-muted hover:text-fg"}>
              {value.title}
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
}
