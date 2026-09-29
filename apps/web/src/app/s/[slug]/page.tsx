import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Logo } from "@repo/ui";
import { brand } from "@repo/copy";
import { AtSign, CalendarCheck, Clock, Gift, Globe, MapPin, Phone, Sparkles, Star, Mail } from "lucide-react";
import { getPublicSalon } from "@/lib/server/public-salon";
import { mediaUrl } from "@/lib/storage";
import { czk } from "@/lib/format";
import { durationLabel } from "@/lib/time";
import type { PublicSalon } from "@/lib/public-types";
import { ThemeToggle } from "@/components/theme-toggle";

const weekdays = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota", "Neděle"];

export async function generateMetadata({ params }: PageProps<"/s/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const salon = await getPublicSalon(slug);
  if (!salon) return { title: "Salon nenalezen" };
  const description = salon.description?.slice(0, 160) ?? `Online rezervace v salonu ${salon.name}. Vyberte službu a termín během minuty.`;
  const image = mediaUrl(salon.cover_path) ?? mediaUrl(salon.logo_path);
  return { title: salon.name, description, openGraph: { title: salon.name, description, images: image ? [image] : undefined } };
}

function hoursByDay(hours: { weekday: number; opens: string; closes: string }[]) {
  return weekdays.map((label, index) => ({
    label,
    intervals: hours.filter((h) => h.weekday === index + 1).map((h) => `${h.opens.slice(0, 5)}–${h.closes.slice(0, 5)}`),
  }));
}

function rewardText(loyalty: NonNullable<PublicSalon["loyalty"]>) {
  if (loyalty.reward_type === "free_service") return loyalty.reward_service ? `${loyalty.reward_service} zdarma` : "službu zdarma";
  if (loyalty.reward_type === "percent_discount") return `slevu ${loyalty.reward_value} %`;
  return `slevu ${czk(loyalty.reward_value)}`;
}

export default async function SalonPage({ params }: PageProps<"/s/[slug]">) {
  const { slug } = await params;
  const salon = await getPublicSalon(slug);
  if (!salon) notFound();

  const accent = salon.brand_color || "#3056d3";
  const cover = mediaUrl(salon.cover_path);
  const logo = mediaUrl(salon.logo_path);
  const bookUrl = `/s/${salon.slug}/rezervace`;
  const rating = salon.reviews.length ? salon.reviews.reduce((sum, r) => sum + r.rating, 0) / salon.reviews.length : null;
  const primary = salon.locations[0];
  const addressLine = [primary?.street ?? salon.address.street, primary?.city ?? salon.address.city].filter(Boolean).join(", ");
  const mapUrl = addressLine ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${salon.name}, ${addressLine}`)}` : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "HealthAndBeautyBusiness",
    name: salon.name,
    description: salon.description ?? undefined,
    telephone: salon.phone ?? undefined,
    email: salon.email ?? undefined,
    url: salon.website ?? undefined,
    image: cover ?? logo ?? undefined,
    address: addressLine ? { "@type": "PostalAddress", streetAddress: primary?.street ?? salon.address.street, addressLocality: primary?.city ?? salon.address.city, postalCode: primary?.zip ?? salon.address.zip, addressCountry: "CZ" } : undefined,
    aggregateRating: rating ? { "@type": "AggregateRating", ratingValue: rating.toFixed(1), reviewCount: salon.reviews.length } : undefined,
  };

  const grouped = [
    ...salon.categories.map((c) => ({ id: c.id, name: c.name, services: salon.services.filter((s) => s.category_id === c.id) })),
    { id: "none", name: salon.categories.length ? "Ostatní služby" : "Služby", services: salon.services.filter((s) => !s.category_id) },
  ].filter((g) => g.services.length);

  return (
    <div className="min-h-screen bg-bg pb-24 sm:pb-0" style={{ ["--salon" as string]: accent }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10" style={{ background: cover ? undefined : `linear-gradient(135deg, ${accent} 0%, color-mix(in srgb, ${accent} 55%, #06b6d4) 100%)` }}>
          {cover && <img src={cover} alt="" className="h-full w-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/35 to-black/70" />
        </div>
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 pt-4 sm:px-6">
          <Link href="/" className="opacity-90 transition hover:opacity-100 [&_span]:text-white">
            <Logo name={brand.name} size={26} />
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/moje" className="rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-medium text-white backdrop-blur transition hover:bg-white/25">
              Moje rezervace
            </Link>
            <ThemeToggle className="bg-white/15 text-white backdrop-blur hover:bg-white/25" />
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-4 pb-10 pt-16 sm:px-6 sm:pb-14 sm:pt-24">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:gap-7">
            <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-3xl border-4 border-white/70 bg-white text-3xl font-bold shadow-xl sm:size-28" style={{ color: accent }}>
              {logo ? <img src={logo} alt={salon.name} className="h-full w-full object-cover" /> : salon.name.slice(0, 1)}
            </div>
            <div className="min-w-0 text-white">
              <h1 className="text-3xl font-bold tracking-tight drop-shadow sm:text-5xl">{salon.name}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-white/90">
                {addressLine && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-4" /> {addressLine}
                  </span>
                )}
                {rating && (
                  <span className="inline-flex items-center gap-1.5">
                    <Star className="size-4 fill-amber-300 text-amber-300" /> {rating.toFixed(1)} ({salon.reviews.length})
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href={bookUrl} className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 text-base font-semibold shadow-lg transition hover:scale-[1.03] active:scale-[0.98]" style={{ color: accent }}>
              <CalendarCheck className="size-5" /> Rezervovat termín
            </Link>
            <Link href={`/s/${salon.slug}/poukaz`} className="inline-flex h-12 items-center gap-2 rounded-xl bg-white/15 px-5 text-base font-medium text-white backdrop-blur transition hover:bg-white/25">
              <Gift className="size-5" /> Dárkový poukaz
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_320px]">
        <div className="grid min-w-0 gap-8">
          {salon.description && (
            <section>
              <p className="whitespace-pre-line text-lg leading-relaxed text-fg-muted">{salon.description}</p>
            </section>
          )}

          {salon.loyalty && (
            <section className="relative overflow-hidden rounded-2xl p-5 text-white shadow-lg sm:p-6" style={{ background: `linear-gradient(120deg, ${accent}, color-mix(in srgb, ${accent} 55%, #06b6d4))` }}>
              <Sparkles className="absolute -right-4 -top-4 size-28 opacity-20" />
              <p className="text-sm font-medium uppercase tracking-wide opacity-90">Věrnostní program</p>
              <p className="mt-1 text-xl font-semibold sm:text-2xl">
                Po {salon.loyalty.threshold} návštěvách máte {rewardText(salon.loyalty)}
              </p>
              <p className="mt-1 text-sm opacity-90">Razítka se sbírají automaticky u dokončených návštěv, stačí se přihlásit při rezervaci.</p>
            </section>
          )}

          <section>
            <h2 className="mb-4 text-2xl font-semibold tracking-tight">Služby a ceník</h2>
            <div className="grid gap-6">
              {grouped.map((group) => (
                <div key={group.id}>
                  {grouped.length > 1 && <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-fg-muted">{group.name}</h3>}
                  <Card className="divide-y divide-border overflow-hidden">
                    {group.services.map((service) => (
                      <Link key={service.id} href={`${bookUrl}?sluzba=${service.id}`} className="group flex items-center gap-4 p-4 transition hover:bg-surface-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">{service.name}</p>
                          {service.description && <p className="mt-0.5 line-clamp-2 text-sm text-fg-muted">{service.description}</p>}
                          <p className="mt-1 inline-flex items-center gap-1 text-sm text-fg-muted">
                            <Clock className="size-3.5" /> {durationLabel(service.duration_min)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">
                            {service.price_is_from ? "od " : ""}
                            {czk(service.price)}
                          </p>
                          <span className="text-sm font-medium opacity-0 transition group-hover:opacity-100" style={{ color: accent }}>
                            Rezervovat →
                          </span>
                        </div>
                      </Link>
                    ))}
                  </Card>
                </div>
              ))}
              {!grouped.length && <p className="text-fg-muted">Salon zatím nemá zveřejněné žádné služby.</p>}
            </div>
          </section>

          {salon.staff.length > 0 && (
            <section>
              <h2 className="mb-4 text-2xl font-semibold tracking-tight">Náš tým</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {salon.staff.map((member) => {
                  const photo = mediaUrl(member.photo_path);
                  return (
                    <Card key={member.id} interactive className="overflow-hidden text-center">
                      <div className="grid aspect-square place-items-center text-4xl font-bold text-white" style={{ background: member.color || accent }}>
                        {photo ? <img src={photo} alt={member.name} className="h-full w-full object-cover" /> : member.name.slice(0, 1)}
                      </div>
                      <div className="p-3">
                        <p className="font-semibold">{member.name}</p>
                        {member.title && <p className="text-sm text-fg-muted">{member.title}</p>}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {salon.photos.length > 0 && (
            <section>
              <h2 className="mb-4 text-2xl font-semibold tracking-tight">Galerie</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {salon.photos.map((photo, index) => (
                  <div key={photo.path} className={`overflow-hidden rounded-xl bg-surface-2 ${index % 5 === 0 ? "col-span-2 row-span-2" : ""}`}>
                    <img src={mediaUrl(photo.path)!} alt={photo.caption ?? salon.name} loading="lazy" className="aspect-square h-full w-full object-cover transition duration-500 hover:scale-105" />
                  </div>
                ))}
              </div>
            </section>
          )}

          {salon.reviews.length > 0 && (
            <section>
              <h2 className="mb-4 flex items-center gap-3 text-2xl font-semibold tracking-tight">
                Recenze {rating && <Badge tone="warning">★ {rating.toFixed(1)}</Badge>}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {salon.reviews.slice(0, 6).map((review, index) => (
                  <Card key={index} className="p-4">
                    <div className="flex gap-0.5 text-amber-400">
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star key={i} className={`size-4 ${i < review.rating ? "fill-current" : "opacity-25"}`} />
                      ))}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed">{review.body}</p>
                    <p className="mt-2 text-sm font-medium text-fg-muted">{review.author}</p>
                  </Card>
                ))}
              </div>
              {salon.google_review_url && (
                <a href={salon.google_review_url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-medium" style={{ color: accent }}>
                  Další recenze na Google →
                </a>
              )}
            </section>
          )}
        </div>

        <aside className="grid content-start gap-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold">
              <Clock className="size-4" style={{ color: accent }} /> Otevírací doba
            </h2>
            <dl className="grid gap-1.5 text-sm">
              {hoursByDay(primary?.hours ?? []).map((day) => (
                <div key={day.label} className="flex justify-between gap-3">
                  <dt className="text-fg-muted">{day.label}</dt>
                  <dd className="font-medium">{day.intervals.length ? day.intervals.join(", ") : "Zavřeno"}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card className="grid gap-3 p-5 text-sm">
            <h2 className="font-semibold">Kontakt</h2>
            {addressLine && (
              <a href={mapUrl ?? undefined} target="_blank" rel="noreferrer" className="flex items-start gap-2.5 hover:underline">
                <MapPin className="mt-0.5 size-4 shrink-0" style={{ color: accent }} /> {addressLine}
              </a>
            )}
            {salon.phone && (
              <a href={`tel:${salon.phone}`} className="flex items-center gap-2.5 hover:underline">
                <Phone className="size-4 shrink-0" style={{ color: accent }} /> {salon.phone}
              </a>
            )}
            {salon.email && (
              <a href={`mailto:${salon.email}`} className="flex items-center gap-2.5 break-all hover:underline">
                <Mail className="size-4 shrink-0" style={{ color: accent }} /> {salon.email}
              </a>
            )}
            {salon.instagram && (
              <a href={`https://instagram.com/${salon.instagram.replace(/^@/, "")}`} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 hover:underline">
                <AtSign className="size-4 shrink-0" style={{ color: accent }} /> {salon.instagram.replace(/^@?/, "@")}
              </a>
            )}
            {salon.website && (
              <a href={salon.website} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 break-all hover:underline">
                <Globe className="size-4 shrink-0" style={{ color: accent }} /> {salon.website.replace(/^https?:\/\//, "")}
              </a>
            )}
          </Card>
        </aside>
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-10 text-center text-sm text-fg-muted sm:px-6">
        Rezervace zajišťuje{" "}
        <Link href="/" className="font-medium hover:underline">
          {brand.name}
        </Link>
      </footer>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/90 p-3 backdrop-blur sm:hidden" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <Link href={bookUrl} className="flex h-12 items-center justify-center gap-2 rounded-xl text-base font-semibold text-white shadow-lg" style={{ background: accent }}>
          <CalendarCheck className="size-5" /> Rezervovat termín
        </Link>
      </div>
    </div>
  );
}
