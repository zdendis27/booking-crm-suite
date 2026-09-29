"use client";

import { Badge, Button, Card, Dialog, EmptyState, Field, Input, Menu, Select, Skeleton, Stagger, StaggerItem, Switch, Textarea, cn, useToast } from "@repo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, Clock, EyeOff, FolderPlus, Globe, MoreHorizontal, Pencil, Plus, RotateCcw, Scissors, Star } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { useSalon } from "@/components/app/salon-context";
import { czk } from "@/lib/format";
import { errorMessage, useSb, useServices, useStaff, type CategoryRow, type ServiceRow } from "@/lib/data";
import { durationLabel } from "@/lib/time";
import { Avatar } from "@repo/ui";

const palette = ["#3056d3", "#14b8a6", "#f59e0b", "#ec4899", "#0ea5e9", "#84cc16", "#f97316", "#8b5cf6"];

interface Draft {
  id?: string;
  name: string;
  description: string;
  category_id: string;
  duration_min: string;
  buffer_after_min: string;
  price: string;
  price_is_from: boolean;
  vat_rate: string;
  online_bookable: boolean;
  counts_for_loyalty: boolean;
  color: string;
}

const emptyDraft: Draft = {
  name: "",
  description: "",
  category_id: "",
  duration_min: "30",
  buffer_after_min: "0",
  price: "",
  price_is_from: false,
  vat_rate: "0",
  online_bookable: true,
  counts_for_loyalty: true,
  color: "#3056d3",
};

export function ServicesPage() {
  const { salon } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const query = useServices(showArchived);
  const staffQuery = useStaff();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [category, setCategory] = useState<{ id?: string; name: string } | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["services"] });
    qc.invalidateQueries({ queryKey: ["staff"] });
  };

  const save = useMutation({
    mutationFn: async (value: Draft) => {
      const payload = {
        name: value.name.trim(),
        description: value.description.trim() || null,
        category_id: value.category_id || null,
        duration_min: Number(value.duration_min),
        buffer_after_min: Number(value.buffer_after_min || 0),
        price: Math.round(Number(value.price.replace(",", ".") || 0) * 100),
        price_is_from: value.price_is_from,
        vat_rate: Number(value.vat_rate),
        online_bookable: value.online_bookable,
        counts_for_loyalty: value.counts_for_loyalty,
        color: value.color,
      };
      if (value.id) {
        const { error } = await sb.from("services").update(payload).eq("id", value.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("services").insert({ ...payload, salon_id: salon.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Služba uložena");
      setDraft(null);
      invalidate();
    },
    onError: (error) => toast.error("Službu se nepodařilo uložit", errorMessage(error)),
  });

  const archive = useMutation({
    mutationFn: async (arg: { id: string; archived: boolean }) => {
      const { error } = await sb.from("services").update({ archived_at: arg.archived ? null : new Date().toISOString() }).eq("id", arg.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error) => toast.error("Akce se nepovedla", errorMessage(error)),
  });

  const saveCategory = useMutation({
    mutationFn: async (value: { id?: string; name: string }) => {
      if (value.id) {
        const { error } = await sb.from("service_categories").update({ name: value.name.trim() }).eq("id", value.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("service_categories").insert({ salon_id: salon.id, name: value.name.trim() });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setCategory(null);
      invalidate();
    },
    onError: (error) => toast.error("Kategorii se nepodařilo uložit", errorMessage(error)),
  });

  const archiveCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("service_categories").update({ archived_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const services = query.data?.services ?? [];
  const categories = query.data?.categories ?? [];
  const staff = staffQuery.data ?? [];
  const groups: { category: CategoryRow | null; services: ServiceRow[] }[] = categories.map((c) => ({ category: c, services: services.filter((s) => s.category_id === c.id) }));
  const uncategorized = services.filter((s) => !s.category_id || !categories.some((c) => c.id === s.category_id));
  if (uncategorized.length) groups.push({ category: null, services: uncategorized });

  function edit(service: ServiceRow) {
    setDraft({
      id: service.id,
      name: service.name,
      description: service.description ?? "",
      category_id: service.category_id ?? "",
      duration_min: String(service.duration_min),
      buffer_after_min: String(service.buffer_after_min),
      price: String(service.price / 100),
      price_is_from: service.price_is_from,
      vat_rate: String(Number(service.vat_rate)),
      online_bookable: service.online_bookable,
      counts_for_loyalty: service.counts_for_loyalty,
      color: service.color ?? "#3056d3",
    });
  }

  return (
    <div>
      <PageHeader
        title="Služby a ceník"
        description="Nastavte služby, délky a ceny. Cenu i délku můžete pro každého pracovníka upravit v sekci Tým."
        actions={
          <>
            <Button variant="secondary" onClick={() => setCategory({ name: "" })} leading={<FolderPlus className="h-4 w-4" />}>
              Kategorie
            </Button>
            <Button onClick={() => setDraft({ ...emptyDraft, category_id: categories[0]?.id ?? "" })} leading={<Plus className="h-4 w-4" />}>
              Nová služba
            </Button>
          </>
        }
      />

      <div className="mb-4 flex items-center justify-end gap-2 text-sm text-fg-muted">
        <Switch checked={showArchived} onCheckedChange={setShowArchived} label="Zobrazit archivované" /> Zobrazit archivované
      </div>

      {query.isLoading ? (
        <div className="grid gap-4">
          <Skeleton className="h-40 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
        </div>
      ) : services.length === 0 && categories.length === 0 ? (
        <Card>
          <EmptyState icon={Scissors} title="Zatím žádné služby" description="Přidejte první službu, aby se zákazníci mohli objednávat." action={<Button onClick={() => setDraft({ ...emptyDraft })}>Přidat službu</Button>} />
        </Card>
      ) : (
        <Stagger className="grid gap-5">
          {groups.map((group) => (
            <StaggerItem key={group.category?.id ?? "other"}>
              <Card>
                <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <h2 className="font-semibold">{group.category?.name ?? "Bez kategorie"}</h2>
                    <Badge>{group.services.length}</Badge>
                  </div>
                  {group.category && (
                    <Menu
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label="Akce kategorie">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      }
                      items={[
                        { label: "Přejmenovat", icon: <Pencil />, onSelect: () => setCategory({ id: group.category!.id, name: group.category!.name }) },
                        { label: "Přidat službu", icon: <Plus />, onSelect: () => setDraft({ ...emptyDraft, category_id: group.category!.id }) },
                        { separator: true, label: "" },
                        { label: "Archivovat kategorii", icon: <Archive />, danger: true, onSelect: () => archiveCategory.mutate(group.category!.id) },
                      ]}
                    />
                  )}
                </div>
                {group.services.length === 0 ? (
                  <p className="p-5 text-sm text-fg-muted">V této kategorii zatím nejsou žádné služby.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {group.services.map((service) => {
                      const performers = staff.filter((s) => s.services[service.id]);
                      return (
                        <li key={service.id} className={cn("group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2/60", service.archived_at && "opacity-60")}>
                          <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: service.color ?? "#3056d3" }} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate font-medium">{service.name}</p>
                              {!service.online_bookable && <Badge tone="neutral"><EyeOff className="h-3 w-3" /> Jen interně</Badge>}
                              {service.online_bookable && <Badge tone="info" className="hidden sm:inline-flex"><Globe className="h-3 w-3" /> Online</Badge>}
                              {service.counts_for_loyalty && <Badge tone="pink" className="hidden md:inline-flex"><Star className="h-3 w-3" /> Věrnost</Badge>}
                              {service.archived_at && <Badge tone="warning">Archivováno</Badge>}
                            </div>
                            {service.description && <p className="mt-0.5 line-clamp-1 text-sm text-fg-muted">{service.description}</p>}
                          </div>
                          <div className="hidden items-center -space-x-2 md:flex">
                            {performers.slice(0, 4).map((s) => (
                              <span key={s.id} className="rounded-full ring-2 ring-surface">
                                <Avatar name={s.display_name} color={s.color} size={26} />
                              </span>
                            ))}
                            {performers.length > 4 && <span className="pl-3 text-xs text-fg-subtle">+{performers.length - 4}</span>}
                          </div>
                          <div className="flex items-center gap-1.5 text-sm text-fg-muted">
                            <Clock className="h-3.5 w-3.5" /> {durationLabel(service.duration_min)}
                          </div>
                          <p className="w-24 text-right font-semibold tabular">
                            {service.price_is_from && <span className="mr-1 text-xs font-normal text-fg-subtle">od</span>}
                            {czk(service.price)}
                          </p>
                          <div className="flex items-center">
                            <Button variant="ghost" size="icon-sm" onClick={() => edit(service)} aria-label="Upravit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon-sm" onClick={() => archive.mutate({ id: service.id, archived: !!service.archived_at })} aria-label={service.archived_at ? "Obnovit" : "Archivovat"}>
                              {service.archived_at ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      <Dialog
        open={!!draft}
        onOpenChange={(open) => !open && setDraft(null)}
        title={draft?.id ? "Upravit službu" : "Nová služba"}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Zrušit
            </Button>
            <Button loading={save.isPending} disabled={!draft?.name.trim() || !draft?.duration_min || draft.price === ""} onClick={() => draft && save.mutate(draft)}>
              Uložit službu
            </Button>
          </>
        }
      >
        {draft && (
          <div className="grid gap-4 pb-2 sm:grid-cols-2">
            <Field label="Název" required className="sm:col-span-2">
              <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} autoFocus />
            </Field>
            <Field label="Kategorie">
              <Select value={draft.category_id} onChange={(event) => setDraft({ ...draft, category_id: event.target.value })}>
                <option value="">Bez kategorie</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Barva">
              <div className="flex flex-wrap gap-2">
                {palette.map((color) => (
                  <button key={color} type="button" onClick={() => setDraft({ ...draft, color })} className={cn("h-8 w-8 rounded-full ring-offset-2 ring-offset-surface transition-all", draft.color === color && "ring-2 ring-accent")} style={{ background: color }} aria-label={color} />
                ))}
              </div>
            </Field>
            <Field label="Popis" className="sm:col-span-2">
              <Textarea rows={2} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
            </Field>
            <Field label="Délka (minuty)" required>
              <Input type="number" min={5} step={5} value={draft.duration_min} onChange={(event) => setDraft({ ...draft, duration_min: event.target.value })} />
            </Field>
            <Field label="Pauza po službě (minuty)" hint="Čas na úklid nebo přípravu">
              <Input type="number" min={0} step={5} value={draft.buffer_after_min} onChange={(event) => setDraft({ ...draft, buffer_after_min: event.target.value })} />
            </Field>
            <Field label="Cena (Kč)" required>
              <Input inputMode="decimal" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} placeholder="450" />
            </Field>
            <Field label="Sazba DPH" hint="Neplátci DPH ponechají 0 %">
              <Select value={draft.vat_rate} onChange={(event) => setDraft({ ...draft, vat_rate: event.target.value })}>
                <option value="0">0 %</option>
                <option value="12">12 %</option>
                <option value="21">21 %</option>
              </Select>
            </Field>
            <div className="grid gap-3 rounded-md border border-border p-4 sm:col-span-2">
              {[
                { key: "price_is_from", label: "Cena je „od“", hint: "Zákazníkovi se zobrazí „od 450 Kč“" },
                { key: "online_bookable", label: "Rezervovatelné online", hint: "Jinak jen interně v kalendáři" },
                { key: "counts_for_loyalty", label: "Počítá se do věrnostního programu", hint: "Za návštěvu se přidá razítko" },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-fg-muted">{item.hint}</p>
                  </div>
                  <Switch checked={draft[item.key as "online_bookable"]} onCheckedChange={(value) => setDraft({ ...draft, [item.key]: value })} label={item.label} />
                </div>
              ))}
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={!!category}
        onOpenChange={(open) => !open && setCategory(null)}
        title={category?.id ? "Přejmenovat kategorii" : "Nová kategorie"}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCategory(null)}>
              Zrušit
            </Button>
            <Button loading={saveCategory.isPending} disabled={!category?.name.trim()} onClick={() => category && saveCategory.mutate(category)}>
              Uložit
            </Button>
          </>
        }
      >
        <div className="pb-2">
          <Field label="Název kategorie">
            <Input value={category?.name ?? ""} onChange={(event) => setCategory({ ...category!, name: event.target.value })} autoFocus />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
