"use client";

import { salonRole } from "@repo/copy";
import { Avatar, Badge, Button, Card, CardHeader, Dialog, EmptyState, Field, Input, Select, Skeleton, Stagger, StaggerItem, cn, useToast } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Copy, Link2, Mail, Plus, ShieldCheck, UserPlus, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { useSalon } from "@/components/app/salon-context";
import { errorMessage, useSb, useStaff } from "@/lib/data";

const palette = ["#3056d3", "#14b8a6", "#f59e0b", "#ec4899", "#0ea5e9", "#84cc16", "#f97316", "#8b5cf6"];

export function TeamPage() {
  const { salon, can, limits, locationId, locations } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const isMgmt = can(["owner", "manager"]);
  const isOwner = can(["owner"]);
  const staff = useStaff();
  const [addOpen, setAddOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [color, setColor] = useState(palette[1]!);
  const [locs, setLocs] = useState<string[]>([locationId]);

  const members = useQuery({
    queryKey: ["members", salon.id],
    enabled: isMgmt,
    queryFn: async () => {
      const { data } = await sb.from("memberships").select("id,user_id,role,created_at").eq("salon_id", salon.id).order("created_at");
      return (data ?? []) as { id: string; user_id: string; role: string; created_at: string }[];
    },
  });

  const invites = useQuery({
    queryKey: ["invites", salon.id],
    enabled: isMgmt,
    queryFn: async () => {
      const { data } = await sb.from("salon_invites").select("id,email,role,accepted_at,expires_at,created_at").eq("salon_id", salon.id).order("created_at", { ascending: false }).limit(20);
      return (data ?? []) as { id: string; email: string; role: string; accepted_at: string | null; expires_at: string }[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { data, error } = await sb.from("staff").insert({ salon_id: salon.id, display_name: name.trim(), title: title.trim() || null, color }).select("id").single();
      if (error) throw error;
      const id = (data as { id: string }).id;
      if (locs.length) {
        const { error: locError } = await sb.from("staff_locations").insert(locs.map((location_id) => ({ staff_id: id, location_id, salon_id: salon.id })));
        if (locError) throw locError;
      }
      return id;
    },
    onSuccess: () => {
      toast.success("Pracovník přidán");
      setAddOpen(false);
      setName("");
      setTitle("");
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (error) => toast.error("Pracovníka se nepodařilo přidat", errorMessage(error)),
  });

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("memberships").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Přístup odebrán");
      qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (error) => toast.error("Přístup se nepodařilo odebrat", errorMessage(error)),
  });

  const list = staff.data ?? [];
  const staffByUser = new Map(list.filter((s) => s.user_id).map((s) => [s.user_id!, s]));
  const atLimit = list.length >= limits.staff;

  return (
    <div>
      <PageHeader
        title="Tým"
        description="Pracovníci, jejich pracovní doba, služby, ceny, provize a docházka."
        actions={
          isMgmt && (
            <>
              <Button variant="secondary" onClick={() => setInviteOpen(true)} leading={<UserPlus className="h-4 w-4" />}>
                Pozvat uživatele
              </Button>
              <Button onClick={() => setAddOpen(true)} leading={<Plus className="h-4 w-4" />} disabled={atLimit}>
                Přidat pracovníka
              </Button>
            </>
          )
        }
      />

      {atLimit && isMgmt && (
        <div className="mb-5 flex items-center gap-3 rounded-lg border border-warning/30 bg-warning-soft p-4 text-sm">
          <ShieldCheck className="h-5 w-5 text-warning" />
          <span className="flex-1">Váš tarif umožňuje {limits.staff} {limits.staff === 1 ? "pracovníka" : "pracovníky"}. Pro další si změňte tarif.</span>
          <Button asChild size="sm" variant="secondary">
            <Link href={`/app/${salon.slug}/nastaveni/tarif`}>Tarify</Link>
          </Button>
        </div>
      )}

      {staff.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-44 rounded-lg" />
          <Skeleton className="h-44 rounded-lg" />
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon={Users} title="Zatím žádný pracovník" />
      ) : (
        <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((s) => (
            <StaggerItem key={s.id}>
              <Link href={`/app/${salon.slug}/tym/${s.id}`}>
                <Card interactive className="group overflow-hidden">
                  <div className="h-16" style={{ background: `linear-gradient(135deg, ${s.color}, color-mix(in srgb, ${s.color} 55%, #06b6d4))` }} />
                  <div className="-mt-9 px-5 pb-5">
                    <span className="inline-block rounded-full ring-4 ring-surface">
                      <Avatar name={s.display_name} color={s.color} size={64} />
                    </span>
                    <div className="mt-3 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-semibold">{s.display_name}</p>
                        <p className="truncate text-sm text-fg-muted">{s.title ?? "Pracovník"}</p>
                      </div>
                      <ArrowRight className="mt-1.5 h-4 w-4 text-fg-subtle transition-transform group-hover:translate-x-1" />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {s.bookable ? <Badge tone="success" dot>Rezervovatelný</Badge> : <Badge tone="neutral">Skrytý</Badge>}
                      <Badge>{Object.keys(s.services).length} služeb</Badge>
                      {s.user_id && <Badge tone="accent"><Link2 className="h-3 w-3" /> Má přístup</Badge>}
                      {locations.length > 1 && <Badge tone="info">{s.locations.length} poboček</Badge>}
                    </div>
                  </div>
                </Card>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      {isMgmt && (
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Uživatelé s přístupem" description="Kdo se může přihlásit do aplikace salonu" />
            <ul className="divide-y divide-border p-2">
              {(members.data ?? []).map((member) => {
                const linked = staffByUser.get(member.user_id);
                return (
                  <li key={member.id} className="flex items-center gap-3 px-3 py-3">
                    <Avatar name={linked?.display_name ?? "?"} color={linked?.color} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{linked?.display_name ?? "Uživatel bez profilu pracovníka"}</p>
                      <p className="text-xs text-fg-subtle">{salonRole[member.role]}</p>
                    </div>
                    {isOwner && member.role !== "owner" && (
                      <Button variant="ghost" size="xs" onClick={() => removeMember.mutate(member.id)}>
                        Odebrat
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Pozvánky" description="Odeslané pozvánky do týmu" />
            <ul className="divide-y divide-border p-2">
              {(invites.data ?? []).length === 0 && <li className="p-4 text-sm text-fg-muted">Zatím žádné pozvánky.</li>}
              {(invites.data ?? []).map((invite) => (
                <li key={invite.id} className="flex items-center gap-3 px-3 py-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-2 text-fg-muted">
                    <Mail className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{invite.email}</p>
                    <p className="text-xs text-fg-subtle">{salonRole[invite.role]}</p>
                  </div>
                  {invite.accepted_at ? <Badge tone="success">Přijato</Badge> : new Date(invite.expires_at) < new Date() ? <Badge tone="neutral">Vypršelo</Badge> : <Badge tone="warning">Čeká</Badge>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <Dialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Nový pracovník"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Zrušit
            </Button>
            <Button loading={add.isPending} disabled={!name.trim()} onClick={() => add.mutate()}>
              Přidat
            </Button>
          </>
        }
      >
        <div className="grid gap-4 pb-2">
          <Field label="Jméno" required>
            <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          </Field>
          <Field label="Pozice">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Např. Barber" />
          </Field>
          <Field label="Barva v kalendáři">
            <div className="flex flex-wrap gap-2">
              {palette.map((value) => (
                <button key={value} type="button" onClick={() => setColor(value)} className={cn("h-8 w-8 rounded-full ring-offset-2 ring-offset-surface transition-all", color === value && "ring-2 ring-accent")} style={{ background: value }} aria-label={value} />
              ))}
            </div>
          </Field>
          {locations.length > 1 && (
            <Field label="Pobočky">
              <div className="flex flex-wrap gap-2">
                {locations.map((location) => (
                  <button
                    key={location.id}
                    type="button"
                    onClick={() => setLocs((current) => (current.includes(location.id) ? current.filter((id) => id !== location.id) : [...current, location.id]))}
                    className={cn("rounded-full border px-3 py-1.5 text-sm transition-colors", locs.includes(location.id) ? "border-accent bg-accent-soft text-accent" : "border-border")}
                  >
                    {location.name}
                  </button>
                ))}
              </div>
            </Field>
          )}
        </div>
      </Dialog>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} staff={list.filter((s) => !s.user_id)} onDone={() => qc.invalidateQueries({ queryKey: ["invites"] })} />
    </div>
  );
}

function InviteDialog({ open, onOpenChange, staff, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; staff: { id: string; display_name: string }[]; onDone: () => void }) {
  const { salon } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("staff");
  const [staffId, setStaffId] = useState("");
  const [link, setLink] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: async () => {
      const { data, error } = await sb.rpc("create_invite", { p_salon: salon.id, p_email: email.trim().toLowerCase(), p_role: role, p_staff: staffId || null });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (token) => {
      setLink(`${window.location.origin}/pozvanka/${token}`);
      onDone();
    },
    onError: (error) => toast.error("Pozvánku se nepodařilo vytvořit", errorMessage(error)),
  });

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setLink(null);
      setEmail("");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Pozvat uživatele"
      description="Pozvaný se přihlásí svým e-mailem a získá přístup podle role."
      size="sm"
      footer={
        link ? (
          <Button onClick={() => close(false)}>Hotovo</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              Zrušit
            </Button>
            <Button loading={invite.isPending} disabled={!/^\S+@\S+\.\S+$/.test(email)} onClick={() => invite.mutate()}>
              Vytvořit pozvánku
            </Button>
          </>
        )
      }
    >
      {link ? (
        <div className="grid gap-4 pb-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-success-soft text-success">
            <UserRound className="h-7 w-7" />
          </div>
          <p className="text-sm text-fg-muted">Pozvánka je připravená. Pošlete tento odkaz osobě, kterou zvete (platí 7 dní).</p>
          <div className="flex gap-2">
            <Input readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
            <Button
              variant="secondary"
              onClick={() => {
                navigator.clipboard.writeText(link);
                toast.success("Odkaz zkopírován");
              }}
              leading={<Copy className="h-4 w-4" />}
            >
              Kopírovat
            </Button>
          </div>
          <Button asChild variant="soft">
            <a href={`mailto:${email}?subject=${encodeURIComponent(`Pozvánka do salonu ${salon.name}`)}&body=${encodeURIComponent(`Ahoj, zvu tě do salonu ${salon.name}: ${link}`)}`}>
              <Mail className="h-4 w-4" /> Otevřít v e-mailu
            </a>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 pb-2">
          <Field label="E-mail" required>
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoFocus />
          </Field>
          <Field label="Role">
            <Select value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="staff">Pracovník (vidí jen svůj kalendář)</option>
              <option value="reception">Recepce (kalendář, klienti, platby)</option>
              <option value="manager">Manažer (vše kromě předplatného)</option>
            </Select>
          </Field>
          {role === "staff" && staff.length > 0 && (
            <Field label="Propojit s pracovníkem" hint="Uvidí jeho kalendář a klienty">
              <Select value={staffId} onChange={(event) => setStaffId(event.target.value)}>
                <option value="">Nepropojovat</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.display_name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      )}
    </Dialog>
  );
}
