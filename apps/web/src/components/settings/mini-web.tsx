"use client";

import { brand } from "@repo/copy";
import { Button, Card, CardHeader, Dialog, Field, Input, Textarea, useToast } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, ExternalLink, ImagePlus, AtSign, Loader2, Plus, Star, Trash2 } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { useSalon } from "@/components/app/salon-context";
import { errorMessage, useSb } from "@/lib/data";
import { mediaUrl, uploadSalonMedia } from "@/lib/storage";

export function MiniWebSettings() {
  const { salon, can } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const editable = can(["owner", "manager"]);
  const [origin, setOrigin] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => setOrigin(window.location.origin), []);
  const bookingUrl = `${origin}/s/${salon.slug}`;
  const reserveUrl = `${bookingUrl}/rezervace`;

  useEffect(() => {
    if (origin) QRCode.toString(reserveUrl, { type: "svg", margin: 1, color: { dark: "#14142b", light: "#ffffff" } }).then(setQr);
  }, [origin, reserveUrl]);

  const photos = useQuery({
    queryKey: ["photos", salon.id],
    queryFn: async () => ((await sb.from("salon_photos").select("*").eq("salon_id", salon.id).order("sort").order("created_at")).data ?? []) as { id: string; path: string; caption: string | null }[],
  });
  const reviews = useQuery({
    queryKey: ["reviews", salon.id],
    queryFn: async () => ((await sb.from("salon_reviews").select("*").eq("salon_id", salon.id).order("created_at", { ascending: false })).data ?? []) as { id: string; author: string; rating: number; body: string | null; published: boolean }[],
  });

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const path = await uploadSalonMedia(sb, salon.id, file, "foto");
        const { error } = await sb.from("salon_photos").insert({ salon_id: salon.id, path });
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["photos"] });
      toast.success("Fotky nahrány");
    } catch (error) {
      toast.error("Nahrání se nepodařilo", errorMessage(error));
    } finally {
      setUploading(false);
    }
  }

  const removePhoto = useMutation({
    mutationFn: async (photo: { id: string; path: string }) => {
      await sb.storage.from("salon-media").remove([photo.path]);
      const { error } = await sb.from("salon_photos").delete().eq("id", photo.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["photos"] }),
  });
  const removeReview = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("salon_reviews").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reviews"] }),
  });

  function downloadQr() {
    if (!qr) return;
    const blob = new Blob([qr], { type: "image/svg+xml" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `qr-${salon.slug}.svg`;
    link.click();
  }

  return (
    <div className="grid gap-5">
      <Card className="overflow-hidden">
        <div className="grid gap-6 p-5 sm:grid-cols-[1fr_auto] sm:p-6">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Váš mini web</h2>
            <p className="mt-1 text-sm text-fg-muted">Každý salon dostane vlastní stránku s ceníkem, týmem, recenzemi a tlačítkem Rezervovat. Zákazníci nemusí nic instalovat.</p>
            <div className="mt-5 grid gap-3">
              <Field label="Adresa stránky">
                <div className="flex gap-2">
                  <Input readOnly value={bookingUrl} onFocus={(event) => event.currentTarget.select()} />
                  <Button variant="secondary" onClick={() => { navigator.clipboard.writeText(bookingUrl); toast.success("Odkaz zkopírován"); }} leading={<Copy className="h-4 w-4" />}>
                    Kopírovat
                  </Button>
                  <Button asChild variant="secondary" size="icon" aria-label="Otevřít">
                    <a href={bookingUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </Field>
              <Field label="Přímý odkaz na rezervaci" hint="Vložte ho do bio na Instagramu, na Facebook nebo do Google profilu">
                <div className="flex gap-2">
                  <Input readOnly value={reserveUrl} onFocus={(event) => event.currentTarget.select()} />
                  <Button variant="secondary" onClick={() => { navigator.clipboard.writeText(reserveUrl); toast.success("Odkaz zkopírován"); }} leading={<AtSign className="h-4 w-4" />}>
                    Pro Instagram
                  </Button>
                </div>
              </Field>
            </div>
            <p className="mt-4 text-xs text-fg-subtle">
              Vlastní doména ({brand.baseDomain.replace("localhost:3000", "vasesalon.cz")}) přijde později. Stránka je dostupná na adrese výše.
            </p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-xl border border-border bg-white p-3 shadow-sm">
              {qr ? <div className="h-40 w-40 [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} /> : <div className="ui-skeleton h-40 w-40" />}
            </div>
            <Button variant="secondary" size="sm" onClick={downloadQr} leading={<Download className="h-4 w-4" />}>
              Stáhnout QR kód
            </Button>
            <p className="max-w-40 text-center text-xs text-fg-subtle">Vytiskněte ho na vizitku nebo do salonu</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Fotogalerie"
          description="Fotky prací a interiéru se zobrazí na mini webu."
          action={
            editable && (
              <>
                <Button size="sm" variant="secondary" loading={uploading} onClick={() => fileInput.current?.click()} leading={<ImagePlus className="h-4 w-4" />}>
                  Nahrát fotky
                </Button>
                <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(event) => addPhotos(event.target.files)} />
              </>
            )
          }
        />
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 lg:grid-cols-4">
          {(photos.data ?? []).map((photo) => (
            <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-lg bg-surface-2">
              <img src={mediaUrl(photo.path)!} alt={photo.caption ?? "Fotka salonu"} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
              {editable && (
                <button type="button" onClick={() => removePhoto.mutate(photo)} className="absolute right-2 top-2 rounded-full bg-black/55 p-1.5 text-white opacity-0 backdrop-blur transition-opacity hover:bg-danger group-hover:opacity-100" aria-label="Smazat fotku">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {uploading && (
            <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-border">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
            </div>
          )}
          {!uploading && (photos.data ?? []).length === 0 && <p className="col-span-full py-6 text-center text-sm text-fg-muted">Zatím žádné fotky. Nahrajte první.</p>}
        </div>
      </Card>

      <Card>
        <CardHeader title="Recenze na webu" description="Vybrané reference zákazníků, které se ukážou na vaší stránce." action={editable && <Button size="sm" variant="secondary" onClick={() => setReviewOpen(true)} leading={<Plus className="h-4 w-4" />}>Přidat</Button>} />
        <ul className="divide-y divide-border p-2">
          {(reviews.data ?? []).length === 0 && <li className="p-5 text-center text-sm text-fg-muted">Zatím žádné recenze.</li>}
          {(reviews.data ?? []).map((review) => (
            <li key={review.id} className="flex items-start gap-3 px-3 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{review.author}</span>
                  <span className="flex text-warning">
                    {Array.from({ length: review.rating }, (_, i) => (
                      <Star key={i} className="h-3.5 w-3.5 fill-current" />
                    ))}
                  </span>
                </div>
                {review.body && <p className="mt-1 text-sm text-fg-muted">{review.body}</p>}
              </div>
              {editable && (
                <button type="button" onClick={() => removeReview.mutate(review.id)} className="rounded-sm p-1.5 text-fg-subtle hover:bg-danger-soft hover:text-danger" aria-label="Smazat">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <ReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} />
    </div>
  );
}

function ReviewDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { salon } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const [author, setAuthor] = useState("");
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("salon_reviews").insert({ salon_id: salon.id, author: author.trim(), rating, body: body.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews"] });
      onOpenChange(false);
      setAuthor("");
      setBody("");
    },
    onError: (error) => toast.error("Recenzi se nepodařilo uložit", errorMessage(error)),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Přidat recenzi"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Zrušit
          </Button>
          <Button loading={save.isPending} disabled={!author.trim()} onClick={() => save.mutate()}>
            Přidat
          </Button>
        </>
      }
    >
      <div className="grid gap-4 pb-2">
        <Field label="Jméno" required>
          <Input value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="Např. Jan K." autoFocus />
        </Field>
        <Field label="Hodnocení">
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((value) => (
              <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${value} hvězdiček`}>
                <Star className={`h-7 w-7 transition-colors ${value <= rating ? "fill-warning text-warning" : "text-border-strong"}`} />
              </button>
            ))}
          </div>
        </Field>
        <Field label="Text">
          <Textarea rows={3} value={body} onChange={(event) => setBody(event.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
