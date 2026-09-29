import { brand, salonRole } from "@repo/copy";
import { Button, Card, Illustration, LogoMark } from "@repo/ui";
import { ArrowRight, Plus, Store, UserRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";

export default async function AppEntryPage() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/prihlaseni?next=/app");

  const { data } = await supabase.from("memberships").select("role, salon:salons(id,name,slug)").eq("user_id", user.id);
  const memberships = (data ?? []) as unknown as { role: string; salon: { id: string; name: string; slug: string } }[];

  if (memberships.length === 1) {
    const only = memberships[0]!;
    redirect(`/app/${only.salon.slug}${only.role === "staff" ? "/kalendar" : ""}`);
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-80 [background:var(--gradient-mesh)]" />
      <div className="w-full max-w-lg">
        <div className="mb-8 flex items-center gap-3">
          <LogoMark size={40} />
          <span className="text-xl font-semibold">{brand.name}</span>
        </div>
        {memberships.length === 0 ? (
          <div className="text-center">
            <div className="flex justify-center">
              <Illustration icon={Store} />
            </div>
            <h1 className="mt-6 text-3xl font-semibold tracking-tight">Vítejte</h1>
            <p className="mt-2 text-fg-muted">Zatím nemáte žádný salon. Založte si ho za pár minut, nebo se podívejte do svého zákaznického účtu.</p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <Button asChild size="lg">
                <Link href="/zalozit-salon">
                  <Plus className="h-4 w-4" /> Založit salon
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/moje">
                  <UserRound className="h-4 w-4" /> Můj zákaznický účet
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-3xl font-semibold tracking-tight">Vyberte salon</h1>
            <p className="mt-2 text-fg-muted">Máte přístup do více salonů.</p>
            <div className="mt-7 grid gap-3">
              {memberships.map((item) => (
                <Link key={item.salon.id} href={`/app/${item.salon.slug}`}>
                  <Card interactive className="flex items-center gap-4 p-4">
                    <span className="flex h-12 w-12 items-center justify-center rounded-md bg-accent-soft text-lg font-bold text-accent">{item.salon.name[0]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{item.salon.name}</span>
                      <span className="text-sm text-fg-muted">{salonRole[item.role]}</span>
                    </span>
                    <ArrowRight className="h-5 w-5 text-fg-subtle" />
                  </Card>
                </Link>
              ))}
              <Button asChild variant="secondary" size="lg">
                <Link href="/zalozit-salon">
                  <Plus className="h-4 w-4" /> Založit další salon
                </Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
