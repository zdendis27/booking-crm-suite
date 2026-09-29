import Link from "next/link";
import { Logo, Reveal, Stagger, StaggerItem } from "@repo/ui";
import { brand, cs, featureLabels } from "@repo/copy";
import {
  ArrowRight,
  BadgeCheck,
  BellRing,
  CalendarCheck,
  Check,
  Crown,
  CircleHelp,
  CreditCard,
  FileText,
  Gift,
  HeartHandshake,
  LayoutGrid,
  LineChart,
  LogIn,
  Rocket,
  Smartphone,
  Sparkles,
  Star,
  Tag,
  UserCog,
  Users,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ThemeToggle } from "@/components/theme-toggle";
import { czk } from "@/lib/format";
import { HeroMockup } from "@/components/landing/hero-mockup";

const features: { icon: LucideIcon; title: string; text: string; color: string }[] = [
  { icon: CalendarCheck, title: "Online rezervace 24/7", text: "Vlastní rezervační stránka, QR kód a odkaz pro Instagram. Klient si vybere službu, specialistu a čas sám.", color: "#3056d3" },
  { icon: Users, title: "Klienti a historie", text: "Karta klienta s poznámkami, historií návštěv, útratou a souhlasy. Vše v souladu s GDPR.", color: "#f97316" },
  { icon: BellRing, title: "Automatické připomínky", text: "Potvrzení, připomínka termínu i chytré vracení klientů podle jejich vlastního rytmu návštěv.", color: "#eab308" },
  { icon: CreditCard, title: "Platby a zálohy", text: "Karta, hotovost, QR platba, poukazy i spropitné. Zálohy proti nedorazivším klientům přes Stripe.", color: "#16a34a" },
  { icon: FileText, title: "České faktury", text: "Faktury, zálohovky a dobropisy s QR platbou, číselnými řadami a exportem pro účetní.", color: "#d946ef" },
  { icon: Gift, title: "Věrnost a poukazy", text: "Pátá návštěva zdarma? Nastavíte pár kliknutími. Dárkové poukazy prodáváte online.", color: "#ec4899" },
  { icon: UserCog, title: "Tým a provize", text: "Rozvrhy pracovníků, docházka, provize ze služeb a výplaty na jedno kliknutí.", color: "#0891b2" },
  { icon: LineChart, title: "Přehledy a AI asistent", text: "Tržby, vytíženost a top služby v jednom dashboardu. Zeptejte se asistenta na cokoliv o svých datech.", color: "#7c3aed" },
];

const steps: { icon: LucideIcon; title: string; text: string; color: string }[] = [
  { icon: Wand2, title: "Založíte salon", text: "Průvodce vás provede za pár minut: služby, ceny, otevírací doba a tým.", color: "#3056d3" },
  { icon: Rocket, title: "Sdílíte odkaz", text: "Rezervační stránka je hned online. Dáte ji na Instagram, web i vizitku.", color: "#f97316" },
  { icon: Sparkles, title: "Systém pracuje za vás", text: "Rezervace, připomínky, platby i doklady se dějí samy. Vy se věnujete klientům.", color: "#16a34a" },
];

const faq = [
  { q: "Musím k tomu mít vlastní web?", a: "Ne. Každý salon dostane hotovou stránku s ceníkem, týmem a rezervací. Ale lze ji propojit i s vaším webem." },
  { q: "Jak funguje ověření klientů?", a: "Klient se přihlásí e-mailem nebo přes Google/Apple. Vy si můžete zapnout i povinný ověřený telefon." },
  { q: "Kolik stojí SMS?", a: "SMS pro přihlášení platíme my. Upozornění klientům chodí e-mailem a push notifikací, SMS jsou volitelná součást vyšších tarifů." },
  { q: "Lze systém používat na telefonu?", a: "Ano. Funguje jako aplikace (PWA): přidáte si ji na plochu a dostáváte upozornění na nové rezervace." },
  { q: "Vystavuje systém doklady podle české legislativy?", a: "Ano. Plátci i neplátci DPH, číselné řady bez mezer, variabilní symbol, QR platba a export pro účetní." },
];

const faqColors = ["#3056d3", "#16a34a", "#f97316", "#ec4899", "#0891b2"];
const planColors: Record<string, string> = { free: "#16a34a", pro: "#3056d3", business: "#d946ef" };
const planTaglines: Record<string, string> = { free: "Pro začátek a vyzkoušení", pro: "Pro salon s týmem, který chce růst", business: "Pro větší salony s plnou výbavou" };

const navItems: { href: string; label: string; icon: LucideIcon; color: string }[] = [
  { href: "#funkce", label: "Funkce", icon: LayoutGrid, color: "#facc15" },
  { href: "#cenik", label: "Ceník", icon: Tag, color: "#4ade80" },
  { href: "#faq", label: "Otázky", icon: CircleHelp, color: "#f0abfc" },
];

function SectionTitle({ icon: Icon, color, title, text }: { icon: LucideIcon; color: string; title: string; text?: string }) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl text-white" style={{ background: color, boxShadow: `0 12px 28px -10px ${color}` }}>
        <Icon className="size-7" />
      </span>
      <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h2>
      {text && <p className="mt-3 text-lg text-fg-muted">{text}</p>}
    </Reveal>
  );
}

export default async function Home() {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.from("plans").select("code,name,price_monthly,limits").order("sort");
  const plans = (data ?? []) as { code: string; name: string; price_monthly: number; limits: { staff: number; locations: number; sms_included: number; features: string[] } }[];
  const tagline = cs.home.tagline.split(" ");
  const shownPlans = ["free", "pro", "business"].map((code) => plans.find((p) => p.code === code)).filter((p): p is (typeof plans)[number] => !!p);

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-30 border-b border-white/15 bg-[#22387d]/95 text-white backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo name={brand.name} className="[&_span]:text-white" />
          <nav className="hidden items-center gap-1 text-sm font-medium md:flex">
            {navItems.map((item) => (
              <a key={item.href} href={item.href} className="group flex items-center gap-2 rounded-lg px-3.5 py-2 text-white/85 transition hover:bg-white/10 hover:text-white">
                <item.icon className="size-[18px] transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-125" style={{ color: item.color }} />
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle className="text-white hover:bg-white/10 hover:text-white" />
            <Link href="/prihlaseni" className="hidden h-10 items-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-medium text-white/90 transition hover:bg-white/10 lg:inline-flex">
              <LogIn className="size-4" /> Přihlásit se
            </Link>
            <Link href="/zalozit-salon" className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-lg bg-[#16a34a] px-4 text-sm font-semibold text-white shadow-lg transition hover:bg-[#15803d] active:scale-95">
              <Wand2 className="size-4" /> Založit salon
            </Link>
          </div>
        </div>
        <nav className="flex justify-center gap-1 border-t border-white/10 px-2 py-1.5 text-sm font-medium md:hidden">
          {navItems.map((item) => (
            <a key={item.href} href={item.href} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-white/85 active:bg-white/10">
              <item.icon className="size-4" style={{ color: item.color }} />
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <section className="relative isolate overflow-hidden bg-[linear-gradient(160deg,#22387d_0%,#3056d3_55%,#4f7cf0_100%)] text-white">
        <span className="absolute -left-24 top-10 -z-10 size-72 rounded-full bg-[#06b6d4]/30 blur-3xl [animation:ui-float_9s_ease-in-out_infinite]" />
        <span className="absolute -right-16 top-32 -z-10 size-80 rounded-full bg-[#d946ef]/25 blur-3xl [animation:ui-float_11s_ease-in-out_infinite]" />
        <span className="absolute bottom-10 left-1/3 -z-10 size-64 rounded-full bg-[#facc15]/15 blur-3xl [animation:ui-float_13s_ease-in-out_infinite]" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-28 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_1fr]">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-medium backdrop-blur">
              <Sparkles className="size-4 text-[#facc15]" /> Pro kadeřnictví, kosmetiku, nehty, masáže i barbery
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl">
              {tagline.slice(0, -1).join(" ")} <span className="text-[#facc15]">{tagline.slice(-1)}</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-white/85 sm:text-xl">Rezervace, klienti, platby, faktury a připomínky na jednom místě. Systém pracuje za vás, vy se věnujete tomu, co umíte nejlépe.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/zalozit-salon" className="inline-flex items-center gap-2 rounded-xl bg-[#16a34a] px-7 py-3.5 text-base font-semibold text-white shadow-xl transition hover:scale-[1.04] hover:bg-[#15803d] active:scale-[0.98]">
                <Rocket className="size-5" /> Vyzkoušet zdarma
              </Link>
              <a href="#funkce" className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-6 py-3.5 text-base font-medium backdrop-blur transition hover:bg-white/25">
                Co všechno umí <ArrowRight className="size-4" />
              </a>
            </div>
            <p className="mt-6 inline-flex items-center gap-2 text-sm text-white/85">
              <BadgeCheck className="size-4 text-[#4ade80]" /> Bez platební karty, stránka salonu za 5 minut
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <HeroMockup />
          </Reveal>
        </div>
        <svg viewBox="0 0 1440 90" preserveAspectRatio="none" className="absolute inset-x-0 bottom-[-1px] h-16 w-full text-bg sm:h-24" aria-hidden>
          <path fill="currentColor" d="M0 60c240 40 480 40 720 10s480-40 720 0v20H0z" />
        </svg>
      </section>

      <section id="funkce" className="mx-auto max-w-6xl scroll-mt-28 px-4 py-16 sm:px-6 sm:py-24">
        <SectionTitle icon={LayoutGrid} color="#3056d3" title="Všechno, co salon potřebuje" text="Žádné skládání pěti aplikací dohromady. Jeden systém, jeden účet, jedna cena." />
        <Stagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <StaggerItem key={feature.title}>
              <div className="group h-full rounded-2xl border border-border bg-surface p-5 shadow-xs transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lg">
                <span className="grid size-12 place-items-center rounded-xl text-white transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110" style={{ background: feature.color, boxShadow: `0 10px 22px -8px ${feature.color}` }}>
                  <feature.icon className="size-6" />
                </span>
                <h3 className="mt-4 text-lg font-bold tracking-tight">{feature.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{feature.text}</p>
                <div className="mt-4 h-1 w-10 rounded-full transition-all duration-300 group-hover:w-full" style={{ background: feature.color }} />
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      <section className="border-y border-border bg-surface-2/70">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionTitle icon={Rocket} color="#f97316" title="Jak to funguje" />
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {steps.map((step, index) => (
              <Reveal key={step.title} delay={index * 0.1}>
                <div className="relative h-full overflow-hidden rounded-2xl bg-surface p-6 shadow-sm">
                  <span className="absolute right-5 top-2 text-7xl font-extrabold text-surface-3">{index + 1}</span>
                  <span className="relative grid size-12 place-items-center rounded-xl text-white" style={{ background: step.color }}>
                    <step.icon className="size-6" />
                  </span>
                  <h3 className="relative mt-4 text-xl font-bold">{step.title}</h3>
                  <p className="relative mt-2 text-fg-muted">{step.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="cenik" className="mx-auto max-w-6xl scroll-mt-28 px-4 py-16 sm:px-6 sm:py-24">
        <SectionTitle icon={Tag} color="#16a34a" title="Jednoduchý ceník" text="Začněte zdarma. Vyšší tarif zapnete, až ho budete potřebovat." />
        <div className="mx-auto mt-14 grid max-w-5xl items-stretch gap-6 md:grid-cols-3">
          {shownPlans.map((plan, index) => {
            const featured = plan.code === "pro";
            const color = planColors[plan.code] ?? "#3056d3";
            const perks = [
              plan.limits.staff >= 999 ? "Neomezený tým" : `${plan.limits.staff} ${plan.limits.staff === 1 ? "pracovník" : plan.limits.staff < 5 ? "pracovníci" : "pracovníků"}`,
              plan.limits.locations >= 99 ? "Neomezené pobočky" : `${plan.limits.locations} ${plan.limits.locations === 1 ? "pobočka" : plan.limits.locations < 5 ? "pobočky" : "pobočky"}`,
              "Online rezervace a klienti",
              ...plan.limits.features.filter((f) => !["automations", "waitlist", "inventory"].includes(f)).slice(0, 4).map((f) => featureLabels[f] ?? f),
            ];
            const more = plan.limits.features.filter((f) => f !== "inventory").length - 4;
            return (
              <Reveal key={plan.code} delay={index * 0.08} className={featured ? "md:-my-4" : ""}>
                <div className={`group relative flex h-full flex-col overflow-hidden rounded-3xl p-7 transition-all duration-300 hover:-translate-y-1.5 ${featured ? "bg-[linear-gradient(160deg,#22387d,#3056d3)] text-white shadow-[0_30px_60px_-20px_rgba(48,86,211,0.65)]" : "border border-border bg-surface shadow-sm hover:shadow-xl"}`}>
                  {featured && <span className="absolute -right-10 -top-10 size-40 rounded-full bg-[#06b6d4]/30 blur-2xl" />}
                  <div className="relative flex items-center justify-between">
                    <span className="grid size-11 place-items-center rounded-xl text-white" style={{ background: featured ? "rgba(255,255,255,0.18)" : color }}>
                      {plan.code === "free" ? <Rocket className="size-5" /> : plan.code === "pro" ? <Sparkles className="size-5" /> : <Crown className="size-5" />}
                    </span>
                    {featured && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#facc15] px-3 py-1 text-xs font-bold text-[#422006]">
                        <Star className="size-3 fill-current" /> Nejoblíbenější
                      </span>
                    )}
                  </div>
                  <p className="relative mt-5 text-lg font-bold">{plan.name}</p>
                  <p className="relative mt-1 flex flex-wrap items-baseline gap-x-1.5">
                    <span className="text-4xl font-extrabold tracking-tight lg:text-5xl">{plan.price_monthly === 0 ? "0 Kč" : czk(plan.price_monthly)}</span>
                    {plan.price_monthly > 0 && <span className={`whitespace-nowrap ${featured ? "text-white/70" : "text-fg-muted"}`}>/ měsíc</span>}
                  </p>
                  <p className={`relative mt-2 text-sm ${featured ? "text-white/75" : "text-fg-muted"}`}>{planTaglines[plan.code]}</p>
                  <div className={`relative my-6 h-px ${featured ? "bg-white/20" : "bg-border"}`} />
                  <ul className="relative grid flex-1 content-start gap-3 text-sm">
                    {perks.map((perk) => (
                      <li key={perk} className="flex items-center gap-3">
                        <span className="grid size-5 shrink-0 place-items-center rounded-full" style={{ background: featured ? "rgba(255,255,255,0.2)" : `color-mix(in srgb, ${color} 14%, transparent)`, color: featured ? "#fff" : color }}>
                          <Check className="size-3" strokeWidth={3.5} />
                        </span>
                        {perk}
                      </li>
                    ))}
                    {more > 0 && <li className={`pl-8 text-xs ${featured ? "text-white/70" : "text-fg-subtle"}`}>a {more} dalších funkcí</li>}
                  </ul>
                  <Link href="/zalozit-salon" className={`relative mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-bold transition active:scale-95 ${featured ? "bg-white text-[#3056d3] hover:bg-white/90" : "text-white hover:brightness-110"}`} style={featured ? undefined : { background: color }}>
                    {plan.price_monthly === 0 ? "Začít zdarma" : "Vybrat tarif"} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </div>
              </Reveal>
            );
          })}
        </div>
        <p className="mt-10 text-center text-sm text-fg-subtle">Ceny jsou bez DPH. Tarif můžete kdykoli změnit nebo zrušit. Potřebujete víc poboček? Napište nám.</p>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <Reveal>
          <div className="relative grid items-center gap-6 overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#22387d,#3056d3)] p-8 text-white shadow-glow sm:p-12 md:grid-cols-[1fr_auto]">
            <span className="absolute -right-10 -top-10 size-52 rounded-full bg-[#06b6d4]/30 blur-2xl [animation:ui-float_8s_ease-in-out_infinite]" />
            <div className="relative">
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Připraveni na plný kalendář?</h2>
              <p className="mt-2 max-w-xl text-lg text-white/85">Založte si salon za pár minut. Bez závazků a bez karty.</p>
            </div>
            <Link href="/zalozit-salon" className="relative inline-flex items-center justify-center gap-2 rounded-xl bg-[#16a34a] px-8 py-3.5 text-base font-bold text-white shadow-lg transition hover:scale-105 hover:bg-[#15803d] active:scale-95">
              <HeartHandshake className="size-5" /> Začít zdarma
            </Link>
          </div>
        </Reveal>
      </section>

      <section id="faq" className="mx-auto max-w-3xl scroll-mt-28 px-4 pb-20 sm:px-6">
        <SectionTitle icon={CircleHelp} color="#d946ef" title="Časté otázky" />
        <div className="mt-8 grid gap-3">
          {faq.map((item, index) => (
            <Reveal key={item.q} delay={index * 0.05}>
              <details className="group rounded-2xl border border-border bg-surface px-5 py-4 shadow-xs transition-shadow open:shadow-md">
                <summary className="flex cursor-pointer list-none items-center gap-3 font-semibold">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg text-white" style={{ background: faqColors[index % faqColors.length] }}>
                    <CircleHelp className="size-5" />
                  </span>
                  <span className="flex-1">{item.q}</span>
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-fg-muted transition-transform duration-300 group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 pl-12 text-fg-muted">{item.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-fg-muted sm:flex-row sm:px-6">
          <div className="flex items-center gap-3">
            <Logo name={brand.name} size={24} />
            <span className="inline-flex items-center gap-1.5">
              <Smartphone className="size-4" /> Funguje na počítači, tabletu i telefonu
            </span>
          </div>
          <nav className="flex gap-5">
            <Link href="/pravni/podminky" className="hover:text-fg">Podmínky</Link>
            <Link href="/pravni/soukromi" className="hover:text-fg">Soukromí</Link>
            <Link href="/pravni/zpracovani" className="hover:text-fg">Zpracování údajů</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
