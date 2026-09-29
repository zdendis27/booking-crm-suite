"use client";

import { Avatar, Button, Field, Input, Spinner, cn, useDebounced, useToast } from "@repo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, UserRoundPlus } from "lucide-react";
import { useState } from "react";
import { useSalon } from "@/components/app/salon-context";
import { errorMessage, useClients, useSb, type ClientListRow } from "@/lib/data";
import { formatPhone, normalizePhone } from "@/lib/format";

export function ClientPicker({ value, onChange }: { value: ClientListRow | null; onChange: (client: ClientListRow | null) => void }) {
  const [term, setTerm] = useState("");
  const [creating, setCreating] = useState(false);
  const debounced = useDebounced(term, 250);
  const clients = useClients(debounced, 8);

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-border bg-surface-2/50 p-3">
        <Avatar name={value.full_name} size={38} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{value.full_name}</p>
          <p className="truncate text-sm text-fg-muted">{[formatPhone(value.phone), value.email].filter(Boolean).join(" · ") || "Bez kontaktu"}</p>
        </div>
        <Button variant="ghost" size="xs" onClick={() => onChange(null)}>
          Změnit
        </Button>
      </div>
    );
  }

  if (creating) {
    return <NewClient onCancel={() => setCreating(false)} onCreated={(client) => onChange(client)} initialName={term} />;
  }

  return (
    <div>
      <Input leading={<Search />} placeholder="Hledat klienta podle jména, telefonu nebo e-mailu" value={term} onChange={(event) => setTerm(event.target.value)} autoFocus />
      <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-border">
        {clients.isFetching && !clients.data ? (
          <div className="flex justify-center p-4">
            <Spinner />
          </div>
        ) : (
          <>
            {(clients.data ?? []).map((client) => (
              <button key={client.id} type="button" onClick={() => onChange(client)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-2">
                <Avatar name={client.full_name} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{client.full_name}</span>
                  <span className="block truncate text-xs text-fg-muted">{formatPhone(client.phone)}</span>
                </span>
                {client.stats && <span className="text-xs text-fg-subtle">{client.stats.visits_count}× u nás</span>}
              </button>
            ))}
            {(clients.data ?? []).length === 0 && <p className="p-4 text-center text-sm text-fg-muted">Nikdo nenalezen.</p>}
          </>
        )}
        <button type="button" onClick={() => setCreating(true)} className={cn("flex w-full items-center gap-3 border-t border-border px-3 py-3 text-left text-sm font-medium text-accent transition-colors hover:bg-accent-soft")}>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft">
            <Plus className="h-4 w-4" />
          </span>
          Přidat nového klienta{term ? `: ${term}` : ""}
        </button>
      </div>
    </div>
  );
}

function NewClient({ onCancel, onCreated, initialName }: { onCancel: () => void; onCreated: (client: ClientListRow) => void; initialName: string }) {
  const { salon } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const queryClient = useQueryClient();
  const parts = initialName.trim().split(/\s+/);
  const [first, setFirst] = useState(parts[0] ?? "");
  const [last, setLast] = useState(parts.slice(1).join(" "));
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await sb
        .from("clients")
        .insert({ salon_id: salon.id, first_name: first.trim(), last_name: last.trim(), phone: phone ? normalizePhone(phone) : null, email: email ? email.trim().toLowerCase() : null, source: "admin" })
        .select("id,first_name,last_name,full_name,phone,email,birthday,created_at,customer_account_id")
        .single();
      if (error) throw error;
      return { ...(data as any), stats: null } as ClientListRow;
    },
    onSuccess: (client) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      onCreated(client);
    },
    onError: (error) => toast.error("Klienta se nepodařilo přidat", errorMessage(error)),
  });

  return (
    <div className="grid gap-3 rounded-md border border-border bg-surface-2/40 p-4">
      <div className="flex items-center gap-2 font-medium">
        <UserRoundPlus className="h-4 w-4 text-accent" /> Nový klient
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Jméno" required>
          <Input value={first} onChange={(event) => setFirst(event.target.value)} autoFocus />
        </Field>
        <Field label="Příjmení">
          <Input value={last} onChange={(event) => setLast(event.target.value)} />
        </Field>
      </div>
      <Field label="Telefon" hint="Např. 777 123 456">
        <Input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
      </Field>
      <Field label="E-mail">
        <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Zpět
        </Button>
        <Button size="sm" loading={create.isPending} disabled={first.trim().length < 1} onClick={() => create.mutate()}>
          Přidat klienta
        </Button>
      </div>
    </div>
  );
}
