"use client";

import { automationTypes, defaultTemplates, featureLabels, templateVariables } from "@repo/copy";
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, Select, Skeleton, Switch, Tabs, Textarea, cn, useDebounced, useToast } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Cake, CalendarClock, CheckCircle2, Clock, Gift, Lock, Mail, Megaphone, MessageSquare, Plus, Repeat, Send, Smartphone, Sparkles, Star, Tag, Trash2, UserCheck, Wand2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { useSalon } from "@/components/app/salon-context";
import { DataTable, type Column } from "@/components/app/data-table";
import { czk } from "@/lib/format";
import { errorMessage, useSb } from "@/lib/data";

type Tab = "automations" | "campaigns" | "promo";

export function MarketingPage() {
  const { hasFeature, salon } = useSalon();
  const [tab, setTab] = useState<Tab>("automations");
  return (
    <div>
      <PageHeader title="Marketing a automatizace" description="Systém posílá zprávy za vás: připomínky, vracení klientů, poděkování i kampaně." />
      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-6"
        tabs={[
          { value: "automations", label: "Automatizace" },
          { value: "campaigns", label: "Kampaně" },
          { value: "promo", label: "Promo kódy" },
        ]}
      />
      {tab === "automations" && <Automations />}
      {tab === "campaigns" && (hasFeature("marketing") ? <Campaigns /> : <Locked feature="marketing" slug={salon.slug} />)}
      {tab === "promo" && <PromoCodes />}
    </div>
  );
}

function Locked({ feature, slug }: { feature: string; slug: string }) {
  return (
    <Card>
      <EmptyState icon={Lock} tone="pink" title={`${featureLabels[feature]} je v jiném tarifu`} description="Navrhněte si vyšší tarif a odemkněte hromadné kampaně." action={<Button asChild><Link href={`/app/${slug}/nastaveni/tarif`}>Zobrazit tarify</Link></Button>} />
    </Card>
  );
}

const automationIcons: Record<string, typeof Mail> = {
  booking_confirmation: CheckCircle2,
  booking_received: Clock,
  booking_reminder: BellRing,
  booking_cancellation: Trash2,
  booking_rescheduled: CalendarClock,
  return_reminder: Repeat,
  followup: Sparkles,
  review_request: Star,
  birthday: Cake,
  waitlist_offer: UserCheck,
};

interface Effective {
  type: string;
  enabled: boolean;
  config: Record<string, number>;
  channels: string[];
  locked: boolean;
  requires: string | null;
}

function Automations() {
  const { salon, hasFeature, limits, can } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const editable = can(["owner", "manager"]);
  const [templateFor, setTemplateFor] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["automations", salon.id],
    queryFn: async () => {
      const [defaults, mine] = await Promise.all([sb.from("automation_defaults").select("*"), sb.from("automations").select("*").eq("salon_id", salon.id)]);
      const order = Object.keys(automationTypes);
      return ((defaults.data ?? []) as any[])
        .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
        .map((d): Effective => {
          const row = ((mine.data ?? []) as any[]).find((m) => m.type === d.type);
          return { type: d.type, enabled: row?.enabled ?? d.enabled, config: { ...(d.config ?? {}), ...(row?.config ?? {}) }, channels: row?.channels ?? ["email", "push"], locked: !!d.requires_feature && !hasFeature(d.requires_feature), requires: d.requires_feature };
        });
    },
  });

  const save = useMutation({
    mutationFn: async (item: Effective) => {
      const { error } = await sb.from("automations").upsert({ salon_id: salon.id, type: item.type, enabled: item.enabled, config: item.config, channels: item.channels }, { onConflict: "salon_id,type" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automations"] }),
    onError: (error) => toast.error("Nastavení se nepodařilo uložit", errorMessage(error)),
  });

  const smsAvailable = limits.sms_included > 0;

  if (query.isLoading) return <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-48 rounded-lg" /><Skeleton className="h-48 rounded-lg" /></div>;

  return (
    <div>
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="relative overflow-hidden p-5 lg:col-span-2">
          <div className="pointer-events-none absolute inset-0 opacity-60 [background:var(--gradient-mesh)]" />
          <div className="relative flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[image:var(--gradient-brand)] text-white shadow-glow">
              <Wand2 className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">Systém pracuje za vás</h2>
              <p className="mt-1 text-sm text-fg-muted">Zprávy se posílají e-mailem a pushem. SMS se odesílají jen tehdy, když váš tarif SMS obsahuje. Provozní zprávy (potvrzení, připomínka) chodí vždy, obchodní jen klientům bez odhlášení.</p>
            </div>
          </div>
        </Card>
        <Card className="flex items-center gap-4 p-5">
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-info-soft text-info">
            <MessageSquare className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm text-fg-muted">SMS v tarifu</p>
            <p className="text-2xl font-semibold tabular">{smsAvailable ? `${limits.sms_included} / měsíc` : "Nezahrnuto"}</p>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {(query.data ?? []).map((item) => {
          const Icon = automationIcons[item.type] ?? Mail;
          const meta = automationTypes[item.type];
          const update = (patch: Partial<Effective>) => save.mutate({ ...item, ...patch });
          return (
            <Card key={item.type} className={cn("flex flex-col p-5 transition-opacity", item.locked && "opacity-70")}>
              <div className="flex items-start gap-3.5">
                <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-md", item.enabled && !item.locked ? "bg-accent-soft text-accent" : "bg-surface-2 text-fg-subtle")}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{meta?.label}</h3>
                    {item.locked && <Badge tone="pink"><Lock className="h-3 w-3" /> {featureLabels[item.requires ?? ""] ?? "Vyšší tarif"}</Badge>}
                  </div>
                  <p className="mt-0.5 text-sm text-fg-muted">{meta?.description}</p>
                </div>
                <Switch checked={item.enabled && !item.locked} disabled={item.locked || !editable} onCheckedChange={(value) => update({ enabled: value })} label={meta?.label} />
              </div>

              {item.enabled && !item.locked && (
                <div className="mt-4 grid gap-3 border-t border-border pt-4">
                  {item.type === "booking_reminder" && (
                    <Field label="Poslat před termínem">
                      <Select value={String(item.config.hours_before ?? 24)} disabled={!editable} onChange={(event) => update({ config: { ...item.config, hours_before: Number(event.target.value) } })}>
                        {[2, 4, 12, 24, 48, 72].map((h) => (
                          <option key={h} value={h}>
                            {h} hodin
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                  {item.type === "return_reminder" && (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Tolerance po očekávané návštěvě">
                        <Select value={String(item.config.tolerance_days ?? 3)} disabled={!editable} onChange={(event) => update({ config: { ...item.config, tolerance_days: Number(event.target.value) } })}>
                          {[1, 3, 5, 7, 14].map((d) => (
                            <option key={d} value={d}>
                              {d} dní
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Druhá připomínka po">
                        <Select value={String(item.config.second_factor ?? 2)} disabled={!editable} onChange={(event) => update({ config: { ...item.config, second_factor: Number(event.target.value) } })}>
                          {[1.5, 2, 3].map((d) => (
                            <option key={d} value={d}>
                              {d}× obvyklé pauze
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                  )}
                  {(item.type === "followup" || item.type === "review_request") && (
                    <Field label="Poslat po návštěvě">
                      <Select value={String(item.config.hours_after ?? (item.type === "followup" ? 3 : 24))} disabled={!editable} onChange={(event) => update({ config: { ...item.config, hours_after: Number(event.target.value) } })}>
                        {[1, 3, 6, 24, 48].map((h) => (
                          <option key={h} value={h}>
                            {h} hodin
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                  {item.type === "review_request" && !salon.google_review_url && (
                    <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">Doplňte odkaz na Google recenze v Nastavení, jinak se zpráva nepošle.</p>
                  )}
                  {item.type === "birthday" && (
                    <Field label="Nabídka v přání" hint="Volitelný text, např. „10 % sleva s kódem NAROZENINY“">
                      <Input disabled={!editable} value={String((item.config as any).offer ?? "")} onChange={(event) => update({ config: { ...item.config, offer: event.target.value as unknown as number } })} />
                    </Field>
                  )}
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">Kanály</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: "email", label: "E-mail", icon: Mail, ok: true },
                        { id: "push", label: "Push", icon: Smartphone, ok: true },
                        { id: "sms", label: "SMS", icon: MessageSquare, ok: smsAvailable },
                      ].map((channel) => {
                        const on = item.channels.includes(channel.id);
                        return (
                          <button
                            key={channel.id}
                            type="button"
                            disabled={!channel.ok || !editable}
                            onClick={() => update({ channels: on ? item.channels.filter((c) => c !== channel.id) : [...item.channels, channel.id] })}
                            title={channel.ok ? undefined : "SMS nejsou součástí vašeho tarifu"}
                            className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-all", on ? "border-accent bg-accent-soft font-medium text-accent" : "border-border text-fg-muted hover:border-border-strong", !channel.ok && "cursor-not-allowed opacity-45")}
                          >
                            <channel.icon className="h-3.5 w-3.5" /> {channel.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {editable && (
                    <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => setTemplateFor(item.type)}>
                      Upravit text zprávy
                    </Button>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <TemplateDialog type={templateFor} onClose={() => setTemplateFor(null)} />
    </div>
  );
}

function TemplateDialog({ type, onClose }: { type: string | null; onClose: () => void }) {
  const { salon } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loaded, setLoaded] = useState<string | null>(null);
  const fallback = type ? defaultTemplates[type] : null;

  const saved = useQuery({
    queryKey: ["template", salon.id, type, channel],
    enabled: !!type,
    queryFn: async () => {
      const { data } = await sb.from("notification_templates").select("subject,body").eq("salon_id", salon.id).eq("type", type!).eq("channel", channel).maybeSingle();
      return data as { subject: string | null; body: string } | null;
    },
  });

  const key = `${type}:${channel}:${saved.dataUpdatedAt}`;
  if (type && fallback && !saved.isFetching && loaded !== key) {
    setLoaded(key);
    setSubject(saved.data?.subject ?? fallback.subject);
    setBody(saved.data?.body ?? (channel === "sms" ? fallback.sms : fallback.body));
  }

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("notification_templates").upsert({ salon_id: salon.id, type: type!, channel, subject: channel === "email" ? subject : null, body }, { onConflict: "salon_id,type,channel" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Text zprávy uložen");
      qc.invalidateQueries({ queryKey: ["template"] });
      onClose();
    },
    onError: (error) => toast.error("Text se nepodařilo uložit", errorMessage(error)),
  });

  const reset = useMutation({
    mutationFn: async () => {
      await sb.from("notification_templates").delete().eq("salon_id", salon.id).eq("type", type!).eq("channel", channel);
    },
    onSuccess: () => {
      setLoaded(null);
      qc.invalidateQueries({ queryKey: ["template"] });
    },
  });

  return (
    <Dialog
      open={!!type}
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      title={type ? automationTypes[type]?.label : ""}
      description="Použijte proměnné, které se při odeslání nahradí skutečnými údaji."
      footer={
        <>
          <Button variant="ghost" className="mr-auto" onClick={() => reset.mutate()}>
            Obnovit výchozí
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Uložit
          </Button>
        </>
      }
    >
      <div className="grid gap-4 pb-2">
        <Tabs variant="pill" value={channel} onChange={(value) => { setChannel(value); setLoaded(null); }} tabs={[{ value: "email", label: "E-mail" }, { value: "sms", label: "SMS" }]} />
        {channel === "email" && (
          <Field label="Předmět">
            <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
          </Field>
        )}
        <Field label="Text zprávy">
          <Textarea rows={11} value={body} onChange={(event) => setBody(event.target.value)} className="font-mono text-sm" />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {templateVariables.map((variable) => (
            <button key={variable.key} type="button" title={variable.label} onClick={() => setBody(`${body}{{${variable.key}}}`)} className="rounded-full border border-border px-2.5 py-1 font-mono text-xs text-fg-muted transition-colors hover:border-accent hover:text-accent">
              {`{{${variable.key}}}`}
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

interface Campaign {
  id: string;
  name: string;
  channel: string;
  subject: string | null;
  body: string;
  segment: Record<string, number>;
  status: string;
  sent_count: number;
  launched_at: string | null;
  created_at: string;
}

function Campaigns() {
  const { salon } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const query = useQuery({
    queryKey: ["campaigns", salon.id],
    queryFn: async () => ((await sb.from("campaigns").select("*").eq("salon_id", salon.id).order("created_at", { ascending: false })).data ?? []) as Campaign[],
  });
  const launch = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await sb.rpc("launch_campaign", { p_campaign: id });
      if (error) throw error;
      return Number(data);
    },
    onSuccess: (count) => {
      toast.success(`Kampaň odeslána`, `Zprávu dostane ${count} klientů`);
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (error) => toast.error("Kampaň se nepodařilo odeslat", errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });

  const segmentLabel = (s: Record<string, number>) => [s.inactive_days ? `nebyli ${s.inactive_days}+ dní` : null, s.min_visits ? `min. ${s.min_visits} návštěv` : null, s.birthday_month ? "narozeniny tento měsíc" : null].filter(Boolean).join(", ") || "všichni klienti";

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button size="lg" onClick={() => setOpen(true)} leading={<Plus className="h-[18px] w-[18px]" />}>
          Nová kampaň
        </Button>
      </div>
      <div className="grid gap-4">
        {query.isLoading && <Skeleton className="h-28 rounded-lg" />}
        {!query.isLoading && (query.data ?? []).length === 0 && <Card><EmptyState icon={Megaphone} title="Zatím žádné kampaně" description="Oslovte neaktivní klienty, oznamte akci nebo přeji všem k svátkům. Zprávu dostanou jen klienti, kteří se neodhlásili." action={<Button onClick={() => setOpen(true)}>Vytvořit kampaň</Button>} /></Card>}
        {(query.data ?? []).map((c) => (
          <Card key={c.id} className="flex flex-wrap items-center gap-4 p-5">
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent-soft text-accent">
              {c.channel === "email" ? <Mail className="h-6 w-6" /> : c.channel === "push" ? <Smartphone className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{c.name}</p>
              <p className="text-sm text-fg-muted">Publikum: {segmentLabel(c.segment)}</p>
            </div>
            {c.status === "sent" ? <Badge tone="success" dot>Odesláno {c.sent_count}×</Badge> : <Badge tone="neutral">Koncept</Badge>}
            {c.status === "draft" && (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => launch.mutate(c.id)} loading={launch.isPending} leading={<Send className="h-4 w-4" />}>
                  Odeslat
                </Button>
                <Button size="icon-sm" variant="ghost" onClick={() => remove.mutate(c.id)} aria-label="Smazat">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
      <CampaignDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function CampaignDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { salon } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [channel, setChannel] = useState("email");
  const [inactive, setInactive] = useState("");
  const [minVisits, setMinVisits] = useState("");
  const [birthday, setBirthday] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("Ahoj {{first_name}},\n\n");
  const segment = {
    ...(inactive ? { inactive_days: Number(inactive) } : {}),
    ...(minVisits ? { min_visits: Number(minVisits) } : {}),
    ...(birthday ? { birthday_month: new Date().getMonth() + 1 } : {}),
  };
  const debouncedSegment = useDebounced(JSON.stringify(segment), 400);
  const count = useQuery({
    queryKey: ["segment-count", salon.id, debouncedSegment],
    enabled: open,
    queryFn: async () => {
      const { data } = await sb.rpc("count_segment", { p_salon: salon.id, p_segment: JSON.parse(debouncedSegment) });
      return Number(data ?? 0);
    },
  });

  const create = useMutation({
    mutationFn: async (sendNow: boolean) => {
      const { data, error } = await sb.from("campaigns").insert({ salon_id: salon.id, name: name.trim(), channel, subject: channel === "email" ? subject : null, body, segment }).select("id").single();
      if (error) throw error;
      if (sendNow) {
        const r = await sb.rpc("launch_campaign", { p_campaign: (data as { id: string }).id });
        if (r.error) throw r.error;
        return Number(r.data);
      }
      return null;
    },
    onSuccess: (sent) => {
      toast.success(sent === null ? "Koncept uložen" : "Kampaň odeslána", sent === null ? undefined : `Zprávu dostane ${sent} klientů`);
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      onOpenChange(false);
      setName("");
    },
    onError: (error) => toast.error("Kampaň se nepodařilo uložit", errorMessage(error)),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title="Nová kampaň"
      description="Vyberte, komu zprávu pošlete, a napište text."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Zrušit
          </Button>
          <Button variant="secondary" loading={create.isPending} disabled={!name.trim() || !body.trim()} onClick={() => create.mutate(false)}>
            Uložit koncept
          </Button>
          <Button loading={create.isPending} disabled={!name.trim() || !body.trim() || (count.data ?? 0) === 0} onClick={() => create.mutate(true)} leading={<Send className="h-4 w-4" />}>
            Odeslat {count.data ? `(${count.data})` : ""}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 pb-2 lg:grid-cols-2">
        <div className="grid content-start gap-4">
          <Field label="Název kampaně" required>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Např. Vraťte se k nám" autoFocus />
          </Field>
          <Field label="Kanál">
            <Select value={channel} onChange={(event) => setChannel(event.target.value)}>
              <option value="email">E-mail</option>
              <option value="push">Push notifikace</option>
            </Select>
          </Field>
          <div className="rounded-md border border-border p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <UserCheck className="h-4 w-4 text-accent" /> Publikum
            </p>
            <div className="grid gap-3">
              <Field label="Neměli návštěvu více než (dní)">
                <div className="flex flex-wrap gap-2">
                  {["", "30", "60", "90", "180"].map((v) => (
                    <button key={v} type="button" onClick={() => setInactive(v)} className={cn("rounded-full border px-3 py-1 text-sm transition-colors", inactive === v ? "border-accent bg-accent-soft text-accent" : "border-border")}>
                      {v || "Bez omezení"}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Alespoň návštěv">
                <Input type="number" min={0} value={minVisits} onChange={(event) => setMinVisits(event.target.value)} inputSize="sm" placeholder="Libovolně" />
              </Field>
              <div className="flex items-center justify-between">
                <span className="text-sm">Jen s narozeninami tento měsíc</span>
                <Switch checked={birthday} onCheckedChange={setBirthday} label="Narozeniny" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-md bg-accent-soft px-3 py-2.5 text-sm text-accent">
              <Gift className="h-4 w-4" />
              Zprávu dostane <span className="font-semibold tabular">{count.data ?? "…"}</span> klientů
            </div>
          </div>
        </div>
        <div className="grid content-start gap-4">
          {channel === "email" && (
            <Field label="Předmět">
              <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
            </Field>
          )}
          <Field label="Text zprávy" required>
            <Textarea rows={10} value={body} onChange={(event) => setBody(event.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {templateVariables.slice(0, 4).map((variable) => (
              <button key={variable.key} type="button" onClick={() => setBody(`${body}{{${variable.key}}}`)} className="rounded-full border border-border px-2.5 py-1 font-mono text-xs text-fg-muted transition-colors hover:border-accent hover:text-accent">
                {`{{${variable.key}}}`}
              </button>
            ))}
          </div>
          <p className="text-xs text-fg-muted">E-mail dostanou klienti bez odhlášení. Push a SMS jen ti, kdo k nim dali souhlas. Každý e-mail obsahuje odkaz pro odhlášení.</p>
        </div>
      </div>
    </Dialog>
  );
}

interface Promo {
  id: string;
  code: string;
  type: string;
  value: number;
  valid_from: string | null;
  valid_to: string | null;
  max_uses: number | null;
  used_count: number;
  active: boolean;
}

function PromoCodes() {
  const { salon, can } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [type, setType] = useState("percent");
  const [value, setValue] = useState("10");
  const [max, setMax] = useState("");
  const [validTo, setValidTo] = useState("");
  const editable = can(["owner", "manager"]);

  const query = useQuery({
    queryKey: ["promo", salon.id],
    queryFn: async () => ((await sb.from("promo_codes").select("*").eq("salon_id", salon.id).order("created_at", { ascending: false })).data ?? []) as Promo[],
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("promo_codes").insert({ salon_id: salon.id, code: code.trim().toUpperCase(), type, value: type === "percent" ? Number(value) : Math.round(Number(value.replace(",", ".")) * 100), max_uses: max ? Number(max) : null, valid_to: validTo ? `${validTo}T23:59:59+00:00` : null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Promo kód vytvořen");
      setOpen(false);
      setCode("");
      qc.invalidateQueries({ queryKey: ["promo"] });
    },
    onError: (error) => toast.error("Kód se nepodařilo vytvořit", errorMessage(error)),
  });
  const toggle = useMutation({
    mutationFn: async (p: Promo) => {
      const { error } = await sb.from("promo_codes").update({ active: !p.active }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["promo"] }),
  });

  const columns: Column<Promo>[] = [
    { key: "code", header: "Kód", cell: (p) => <span className="inline-flex items-center gap-2 font-mono font-semibold"><Tag className="h-4 w-4 text-accent" />{p.code}</span> },
    { key: "value", header: "Sleva", cell: (p) => (p.type === "percent" ? `${p.value} %` : czk(p.value)) },
    { key: "used", header: "Použito", hide: "sm", cell: (p) => `${p.used_count}${p.max_uses ? ` / ${p.max_uses}` : ""}` },
    { key: "valid", header: "Platí do", hide: "md", cell: (p) => (p.valid_to ? new Date(p.valid_to).toLocaleDateString("cs-CZ") : "Bez omezení") },
    { key: "active", header: "Stav", align: "right", cell: (p) => <Switch checked={p.active} disabled={!editable} onCheckedChange={() => toggle.mutate(p)} label="Aktivní" /> },
  ];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">Slevové kódy uplatníte u rezervace. Každý kód lze omezit počtem použití a datem.</p>
        {editable && (
          <Button onClick={() => setOpen(true)} leading={<Plus className="h-4 w-4" />}>
            Nový kód
          </Button>
        )}
      </div>
      <DataTable columns={columns} rows={query.data ?? []} getKey={(p) => p.id} loading={query.isLoading} empty={<EmptyState icon={Tag} title="Žádné promo kódy" />} />
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Nový promo kód"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Zrušit
            </Button>
            <Button loading={create.isPending} disabled={code.trim().length < 3 || !value} onClick={() => create.mutate()}>
              Vytvořit
            </Button>
          </>
        }
      >
        <div className="grid gap-4 pb-2">
          <Field label="Kód" required>
            <Input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="JARO10" className="font-mono" autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Typ slevy">
              <Select value={type} onChange={(event) => setType(event.target.value)}>
                <option value="percent">Procenta</option>
                <option value="fixed">Částka</option>
              </Select>
            </Field>
            <Field label={type === "percent" ? "Sleva (%)" : "Sleva (Kč)"}>
              <Input inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Max. použití">
              <Input type="number" min={1} value={max} onChange={(event) => setMax(event.target.value)} placeholder="Neomezeně" />
            </Field>
            <Field label="Platí do">
              <Input type="date" value={validTo} onChange={(event) => setValidTo(event.target.value)} />
            </Field>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
