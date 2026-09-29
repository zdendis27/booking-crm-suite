"use client";

import { Button, DatePicker, Dialog, Field, Input, useToast } from "@repo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSalon } from "@/components/app/salon-context";
import { errorMessage, useSb } from "@/lib/data";
import { normalizePhone } from "@/lib/format";

export interface EditableClient {
  id?: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  birthday: string | null;
}

export function ClientFormDialog({
  open,
  onOpenChange,
  client,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: EditableClient | null;
  onSaved?: (id: string) => void;
}) {
  const { salon } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFirst(client?.first_name ?? "");
    setLast(client?.last_name ?? "");
    setPhone(client?.phone ?? "");
    setEmail(client?.email ?? "");
    setBirthday(client?.birthday ?? null);
  }, [open, client]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        first_name: first.trim(),
        last_name: last.trim(),
        phone: phone.trim() ? normalizePhone(phone) : null,
        email: email.trim() ? email.trim().toLowerCase() : null,
        birthday,
      };
      if (client?.id) {
        const { error } = await sb.from("clients").update(payload).eq("id", client.id);
        if (error) throw error;
        return client.id;
      }
      const { data, error } = await sb.from("clients").insert({ ...payload, salon_id: salon.id, source: "admin" }).select("id").single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: (id) => {
      toast.success(client?.id ? "Klient uložen" : "Klient přidán");
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["client"] });
      onOpenChange(false);
      onSaved?.(id);
    },
    onError: (error) => toast.error("Klienta se nepodařilo uložit", errorMessage(error)),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={client?.id ? "Upravit klienta" : "Nový klient"}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Zrušit
          </Button>
          <Button loading={save.isPending} disabled={!first.trim()} onClick={() => save.mutate()}>
            Uložit
          </Button>
        </>
      }
    >
      <div className="grid gap-4 pb-2">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Jméno" required>
            <Input value={first} onChange={(event) => setFirst(event.target.value)} autoFocus />
          </Field>
          <Field label="Příjmení">
            <Input value={last} onChange={(event) => setLast(event.target.value)} />
          </Field>
        </div>
        <Field label="Telefon" hint="Např. 777 123 456 nebo +421 905 123 456">
          <Input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </Field>
        <Field label="E-mail">
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Field label="Datum narození" hint="Pro narozeninovou nabídku">
          <DatePicker value={birthday} onChange={setBirthday} max={new Date().toISOString().slice(0, 10)} />
        </Field>
      </div>
    </Dialog>
  );
}
