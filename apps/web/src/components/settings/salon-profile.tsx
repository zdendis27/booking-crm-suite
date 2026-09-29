"use client";

import { Button, Card, CardHeader, Field, Input, Textarea, cn, useToast } from "@repo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useSalon } from "@/components/app/salon-context";
import { errorMessage, useSb } from "@/lib/data";
import { mediaUrl, uploadSalonMedia } from "@/lib/storage";
import { useQuery } from "@tanstack/react-query";

const swatches = ["#3056d3", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316", "#f59e0b", "#14b8a6", "#0ea5e9", "#22c55e", "#111827"];

export function SalonProfile() {
  const { salon, can } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const editable = can(["owner", "manager"]);
  const [uploading, setUploading] = useState<"logo" | "cover" | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  const query = useQuery({
    queryKey: ["salon-profile", salon.id],
    queryFn: async () => {
      const { data, error } = await sb.from("salons").select("*").eq("id", salon.id).single();
      if (error) throw error;
      return data as any;
    },
  });

  const [form, setForm] = useState<Record<string, string> | null>(null);
  if (query.data && !form) {
    const s = query.data;
    setForm({ name: s.name ?? "", description: s.description ?? "", phone: s.phone ?? "", email: s.email ?? "", website: s.website ?? "", instagram: s.instagram ?? "", street: s.address_street ?? "", city: s.address_city ?? "", zip: s.address_zip ?? "", color: s.brand_color ?? "#3056d3", review: s.google_review_url ?? "", logo: s.logo_path ?? "", cover: s.cover_path ?? "" });
  }

  const save = useMutation({
    mutationFn: async () => {
      const f = form!;
      const { error } = await sb
        .from("salons")
        .update({ name: f.name.trim(), description: f.description || null, phone: f.phone || null, email: f.email ? f.email.toLowerCase() : null, website: f.website || null, instagram: f.instagram.replace(/^@/, "") || null, address_street: f.street || null, address_city: f.city || null, address_zip: f.zip || null, brand_color: f.color, google_review_url: f.review || null, logo_path: f.logo || null, cover_path: f.cover || null })
        .eq("id", salon.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nastavení uloženo");
      qc.invalidateQueries({ queryKey: ["salon-profile"] });
      router.refresh();
    },
    onError: (error) => toast.error("Uložení se nepodařilo", errorMessage(error)),
  });

  async function upload(kind: "logo" | "cover", file: File | undefined) {
    if (!file || !form) return;
    setUploading(kind);
    try {
      const path = await uploadSalonMedia(sb, salon.id, file, kind);
      setForm({ ...form, [kind]: path });
      toast.success("Obrázek nahrán", "Nezapomeňte uložit změny.");
    } catch (error) {
      toast.error("Nahrání se nepodařilo", errorMessage(error));
    } finally {
      setUploading(null);
    }
  }

  if (!form) return <div className="ui-skeleton h-96 rounded-lg" />;
  const set = (key: string, value: string) => setForm({ ...form, [key]: value });

  return (
    <div className="grid gap-5">
      <Card className="overflow-hidden">
        <div className="relative h-40 bg-[image:var(--gradient-brand)] sm:h-52" style={form.cover ? { backgroundImage: `url(${mediaUrl(form.cover)})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: `linear-gradient(135deg, ${form.color}, color-mix(in srgb, ${form.color} 50%, #ec4899))` }}>
          {editable && (
            <button type="button" onClick={() => coverInput.current?.click()} className="absolute right-3 top-3 inline-flex items-center gap-2 rounded-md bg-black/40 px-3 py-2 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-black/55">
              {uploading === "cover" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} Změnit titulní fotku
            </button>
          )}
          <input ref={coverInput} type="file" accept="image/*" hidden onChange={(event) => upload("cover", event.target.files?.[0])} />
        </div>
        <div className="-mt-10 flex items-end gap-4 px-5 pb-5 sm:px-6">
          <button type="button" disabled={!editable} onClick={() => logoInput.current?.click()} className="group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface text-2xl font-bold shadow-md ring-4 ring-surface" style={{ color: form.color }}>
            {form.logo ? <img src={mediaUrl(form.logo)!} alt="Logo" className="h-full w-full object-cover" /> : form.name[0]}
            {editable && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
                {uploading === "logo" ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              </span>
            )}
          </button>
          <input ref={logoInput} type="file" accept="image/*" hidden onChange={(event) => upload("logo", event.target.files?.[0])} />
          <div className="pb-1">
            <p className="text-xl font-semibold">{form.name}</p>
            <p className="text-sm text-fg-muted">Logo a titulní fotka se zobrazí na vaší rezervační stránce</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Základní údaje" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Název salonu" required className="sm:col-span-2">
            <Input value={form.name} onChange={(event) => set("name", event.target.value)} disabled={!editable} />
          </Field>
          <Field label="Popis" hint="Zobrazí se na úvodní stránce" className="sm:col-span-2">
            <Textarea rows={3} value={form.description} onChange={(event) => set("description", event.target.value)} disabled={!editable} />
          </Field>
          <Field label="Telefon">
            <Input type="tel" value={form.phone} onChange={(event) => set("phone", event.target.value)} disabled={!editable} />
          </Field>
          <Field label="E-mail">
            <Input type="email" value={form.email} onChange={(event) => set("email", event.target.value)} disabled={!editable} />
          </Field>
          <Field label="Web">
            <Input value={form.website} onChange={(event) => set("website", event.target.value)} placeholder="https://" disabled={!editable} />
          </Field>
          <Field label="Instagram" hint="Uživatelské jméno bez @">
            <Input value={form.instagram} onChange={(event) => set("instagram", event.target.value)} disabled={!editable} />
          </Field>
          <Field label="Ulice a číslo" className="sm:col-span-2">
            <Input value={form.street} onChange={(event) => set("street", event.target.value)} disabled={!editable} />
          </Field>
          <Field label="Město">
            <Input value={form.city} onChange={(event) => set("city", event.target.value)} disabled={!editable} />
          </Field>
          <Field label="PSČ">
            <Input value={form.zip} onChange={(event) => set("zip", event.target.value)} disabled={!editable} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Barva značky" description="Použije se na rezervační stránce, v e-mailech a na dokladech." />
        <div className="flex flex-wrap items-center gap-3 p-5">
          {swatches.map((color) => (
            <button key={color} type="button" disabled={!editable} onClick={() => set("color", color)} className={cn("h-10 w-10 rounded-full ring-offset-2 ring-offset-surface transition-all hover:scale-110", form.color === color && "ring-2 ring-accent")} style={{ background: color }} aria-label={color} />
          ))}
          <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
            <input type="color" value={form.color} disabled={!editable} onChange={(event) => set("color", event.target.value)} className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0" />
            Vlastní
          </label>
        </div>
      </Card>

      <Card>
        <CardHeader title="Google recenze" description="Odkaz, na který systém klienty po návštěvě odkáže s prosbou o hodnocení." />
        <div className="p-5">
          <Field label="Odkaz na hodnocení Google">
            <Input value={form.review} onChange={(event) => set("review", event.target.value)} placeholder="https://g.page/r/…/review" disabled={!editable} />
          </Field>
        </div>
      </Card>

      {editable && (
        <div className="sticky bottom-20 z-10 flex justify-end lg:bottom-4">
          <Button size="lg" loading={save.isPending} onClick={() => save.mutate()} leading={<Save className="h-[18px] w-[18px]" />} className="shadow-lg">
            Uložit změny
          </Button>
        </div>
      )}
    </div>
  );
}
