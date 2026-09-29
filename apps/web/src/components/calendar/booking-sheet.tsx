"use client";

import { bookingSource, bookingStatus, paymentMethod } from "@repo/copy";
import { Avatar, Badge, Button, DatePicker, Dialog, Divider, Field, Input, Menu, ProgressBar, Select, Sheet, Skeleton, Textarea, useToast } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, CheckCheck, CircleDollarSign, Clock, FileText, Gift, MoreHorizontal, Move, Percent, Phone, RotateCcw, UserX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSalon } from "@/components/app/salon-context";
import { czk, formatPhone } from "@/lib/format";
import { errorMessage, useSb, useStaff } from "@/lib/data";
import { formatDateTime, formatTime, localToISO, toLocal } from "@/lib/time";

interface Detail {
  id: string;
  status: string;
  source: string;
  starts_at: string;
  ends_at: string;
  price_total: number;
  discount_total: number;
  products_total: number;
  deposit_amount: number;
  client_note: string | null;
  internal_note: string | null;
  cancel_reason: string | null;
  primary_staff_id: string | null;
  client_id: string;
  location_id: string;
  expires_at: string | null;
  client: { id: string; first_name: string; last_name: string; full_name: string; phone: string | null; email: string | null } | null;
  items: { id: string; service_id: string; staff_id: string; position: number; name_snap: string; price_snap: number; duration_snap: number; starts_at: string }[];
  adjustments: { id: string; kind: string; label: string; amount: number }[];
  products: { id: string; name_snap: string; quantity: number; unit_price_snap: number }[];
  payments: { id: string; kind: string; method: string; amount: number; paid_at: string; status: string; refund_of: string | null; note: string | null }[];
}

const select =
  "id,status,source,starts_at,ends_at,price_total,discount_total,products_total,deposit_amount,client_note,internal_note,cancel_reason,primary_staff_id,client_id,location_id,expires_at," +
  "client:clients(id,first_name,last_name,full_name,phone,email)," +
  "items:booking_items(id,service_id,staff_id,position,name_snap,price_snap,duration_snap,starts_at)," +
  "adjustments:booking_adjustments(id,kind,label,amount)," +
  "products:booking_products(id,name_snap,quantity,unit_price_snap)," +
  "payments:payments(id,kind,method,amount,paid_at,status,refund_of,note)";

export function BookingSheet({ bookingId, onClose }: { bookingId: string | null; onClose: () => void }) {
  const { salon, can, hasFeature } = useSalon();
  const sb = useSb();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const staffQuery = useStaff(true);
  const [dialog, setDialog] = useState<null | "pay" | "move" | "cancel">(null);
  const [internal, setInternal] = useState("");
  const [promo, setPromo] = useState("");

  const query = useQuery({
    queryKey: ["booking", bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await sb.from("bookings").select(select).eq("id", bookingId!).single();
      if (error) throw error;
      const row = data as unknown as any;
      row.items = [...(row.items ?? [])].sort((a: any, b: any) => a.position - b.position);
      row.payments = [...(row.payments ?? [])].sort((a: any, b: any) => a.paid_at.localeCompare(b.paid_at));
      return row as Detail;
    },
  });
  const booking = query.data;

  useEffect(() => {
    if (booking) setInternal(booking.internal_note ?? "");
  }, [booking?.id, booking?.internal_note]);

  const rewards = useQuery({
    queryKey: ["rewards", booking?.client_id],
    enabled: !!booking && hasFeature("loyalty"),
    queryFn: async () => {
      const { data } = await sb.from("loyalty_rewards").select("id,reward_type,reward_value,expires_at,reward_service_id").eq("client_id", booking!.client_id).eq("status", "available");
      return (data ?? []) as { id: string; reward_type: string; reward_value: number | null; expires_at: string | null }[];
    },
  });

  const stats = useQuery({
    queryKey: ["client-stats", booking?.client_id],
    enabled: !!booking,
    queryFn: async () => {
      const { data } = await sb.from("client_stats").select("visits_count,total_spent,last_visit_at,no_show_count").eq("client_id", booking!.client_id).maybeSingle();
      return data as { visits_count: number; total_spent: number; last_visit_at: string | null; no_show_count: number } | null;
    },
  });

  function refresh() {
    for (const key of ["booking", "bookings", "snapshot", "upcoming", "clients", "client", "rewards", "client-stats", "pending-count", "cash", "finance", "products", "notifications"]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  }

  function useAct<T>(fn: (arg: T) => Promise<unknown>, success: string) {
    return useMutation({
      mutationFn: fn,
      onSuccess: () => {
        toast.success(success);
        refresh();
        setDialog(null);
      },
      onError: (error) => toast.error("Akce se nepovedla", errorMessage(error)),
    });
  }

  const setStatus = useAct(async (arg: { status: string; reason?: string }) => {
    const { error } = await sb.rpc("set_booking_status", { p_booking: bookingId, p_status: arg.status, p_reason: arg.reason ?? null });
    if (error) throw error;
  }, "Stav rezervace změněn");

  const saveNote = useAct(async () => {
    const { error } = await sb.rpc("update_booking_notes", { p_booking: bookingId, p_internal_note: internal });
    if (error) throw error;
  }, "Poznámka uložena");

  const redeem = useAct(async (rewardId: string) => {
    const { error } = await sb.rpc("redeem_reward", { p_reward: rewardId, p_booking: bookingId });
    if (error) throw error;
  }, "Věrnostní odměna uplatněna");

  const applyPromo = useAct(async () => {
    const { error } = await sb.rpc("apply_promo", { p_booking: bookingId, p_code: promo });
    if (error) throw error;
    setPromo("");
  }, "Promo kód uplatněn");

  const createInvoice = useMutation({
    mutationFn: async () => {
      const { data, error } = await sb.rpc("create_invoice_from_booking", { p_booking: bookingId });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (id) => {
      toast.success("Koncept faktury vytvořen");
      router.push(`/app/${salon.slug}/faktury/${id}`);
    },
    onError: (error) => toast.error("Fakturu se nepodařilo vytvořit", errorMessage(error)),
  });


  const status = booking ? bookingStatus[booking.status] : null;
  const total = booking ? booking.price_total + booking.products_total - booking.discount_total : 0;
  const paid = booking ? booking.payments.filter((p) => p.status === "succeeded" && ["payment", "deposit", "refund"].includes(p.kind)).reduce((sum, p) => sum + p.amount, 0) : 0;
  const tips = booking ? booking.payments.filter((p) => p.kind === "tip").reduce((sum, p) => sum + p.amount, 0) : 0;
  const balance = total - paid;
  const staffNames = useMemo(() => {
    const map = new Map((staffQuery.data ?? []).map((s) => [s.id, s]));
    return map;
  }, [staffQuery.data]);
  const isMgmt = can(["owner", "manager"]);
  const isOps = can(["owner", "manager", "reception"]);
  const active = booking && ["pending", "confirmed"].includes(booking.status);
  const local = booking ? toLocal(booking.starts_at, salon.timezone) : null;

  return (
    <>
      <Sheet
        open={!!bookingId}
        onOpenChange={(open) => !open && onClose()}
        title={booking?.client?.full_name ?? "Rezervace"}
        description={booking ? `${formatDateTime(booking.starts_at, salon.timezone)} – ${formatTime(booking.ends_at, salon.timezone)}` : undefined}
        width="sm:w-[560px]"
        footer={
          booking && (
            <div className="flex flex-wrap items-center gap-2">
              {booking.status === "pending" && (
                <Button loading={setStatus.isPending} onClick={() => setStatus.mutate({ status: "confirmed" })} leading={<Check className="h-4 w-4" />}>
                  Potvrdit
                </Button>
              )}
              {booking.status === "confirmed" && (
                <Button loading={setStatus.isPending} onClick={() => setStatus.mutate({ status: "completed" })} leading={<CheckCheck className="h-4 w-4" />}>
                  Dokončit návštěvu
                </Button>
              )}
              {isOps && active && balance > 0 && (
                <Button variant="secondary" onClick={() => setDialog("pay")} leading={<CircleDollarSign className="h-4 w-4" />}>
                  Přijmout platbu
                </Button>
              )}
              {booking.status === "completed" && balance > 0 && isOps && (
                <Button variant="secondary" onClick={() => setDialog("pay")} leading={<CircleDollarSign className="h-4 w-4" />}>
                  Přijmout platbu
                </Button>
              )}
              {["cancelled_by_client", "cancelled_by_salon", "no_show"].includes(booking.status) && isOps && (
                <Button variant="secondary" loading={setStatus.isPending} onClick={() => setStatus.mutate({ status: "confirmed" })} leading={<RotateCcw className="h-4 w-4" />}>
                  Obnovit rezervaci
                </Button>
              )}
              <div className="ml-auto">
                <Menu
                  trigger={
                    <Button variant="ghost" size="icon" aria-label="Další akce">
                      <MoreHorizontal className="h-5 w-5" />
                    </Button>
                  }
                  items={[
                    { label: "Přesunout termín", icon: <Move />, onSelect: () => setDialog("move"), disabled: !active },
                    { label: "Nedostavil se", icon: <UserX />, onSelect: () => setStatus.mutate({ status: "no_show", reason: "Nedostavil se" }), disabled: booking.status !== "confirmed" },
                    { label: "Zrušit rezervaci", icon: <Ban />, onSelect: () => setDialog("cancel"), disabled: !active, danger: true },
                    { separator: true, label: "" },
                    { label: "Vrátit na potvrzeno", icon: <RotateCcw />, onSelect: () => setStatus.mutate({ status: "confirmed" }), disabled: booking.status !== "completed" || !isMgmt },
                    { label: "Vystavit fakturu", icon: <FileText />, onSelect: () => createInvoice.mutate(), disabled: !hasFeature("invoicing") || !isOps },
                  ]}
                />
              </div>
            </div>
          )
        }
      >
        {query.isLoading || !booking ? (
          <div className="space-y-4 p-5">
            <Skeleton className="h-16" />
            <Skeleton className="h-32" />
            <Skeleton className="h-24" />
          </div>
        ) : (
          <div className="divide-y divide-border">
            <div className="p-5">
              <div className="flex items-start gap-4">
                <Avatar name={booking.client?.full_name ?? "?"} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {booking.client ? (
                      <Link href={`/app/${salon.slug}/klienti/${booking.client.id}`} className="truncate text-lg font-semibold hover:text-accent">
                        {booking.client.full_name}
                      </Link>
                    ) : null}
                    {status && <Badge tone={status.tone} dot>{status.label}</Badge>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-muted">
                    {booking.client?.phone && (
                      <a href={`tel:${booking.client.phone}`} className="inline-flex items-center gap-1.5 hover:text-accent">
                        <Phone className="h-3.5 w-3.5" /> {formatPhone(booking.client.phone)}
                      </a>
                    )}
                    {booking.client?.email && <span className="truncate">{booking.client.email}</span>}
                  </div>
                  {stats.data && (
                    <p className="mt-2 text-xs text-fg-subtle">
                      {stats.data.visits_count}× u nás · útrata {czk(stats.data.total_spent)}
                      {stats.data.no_show_count > 0 && <span className="text-danger"> · {stats.data.no_show_count}× nedorazil</span>}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md bg-surface-2 p-3">
                  <p className="text-xs text-fg-subtle">Termín</p>
                  <p className="mt-0.5 flex items-center gap-1.5 font-semibold">
                    <Clock className="h-4 w-4 text-accent" />
                    {local?.day.split("-").reverse().map(Number).slice(0, 2).join(". ")}. {formatTime(booking.starts_at, salon.timezone)}
                  </p>
                </div>
                <div className="rounded-md bg-surface-2 p-3">
                  <p className="text-xs text-fg-subtle">Zdroj</p>
                  <p className="mt-0.5 font-semibold">{bookingSource[booking.source]}</p>
                </div>
              </div>
              {booking.status === "pending" && booking.expires_at && (
                <p className="mt-3 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">Rezervace se uvolní {formatDateTime(booking.expires_at, salon.timezone)}, pokud nebude potvrzena.</p>
              )}
              {booking.client_note && <p className="mt-3 rounded-md bg-info-soft px-3 py-2 text-sm text-fg">„{booking.client_note}“</p>}
              {booking.cancel_reason && <p className="mt-3 text-sm text-fg-muted">Důvod: {booking.cancel_reason}</p>}
            </div>

            <div className="p-5">
              <h4 className="mb-3 text-sm font-semibold">Služby a cena</h4>
              <ul className="space-y-2.5">
                {booking.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 text-sm">
                    <Avatar name={staffNames.get(item.staff_id)?.display_name ?? "?"} color={staffNames.get(item.staff_id)?.color} size={26} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{item.name_snap}</span>
                      <span className="block text-xs text-fg-subtle">
                        {staffNames.get(item.staff_id)?.display_name} · {item.duration_snap} min
                      </span>
                    </span>
                    <span className="tabular">{czk(item.price_snap)}</span>
                  </li>
                ))}
                {booking.adjustments.map((adj) => (
                  <li key={adj.id} className="flex items-center gap-3 text-sm text-success">
                    <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-success-soft">
                      {adj.kind === "loyalty_reward" ? <Gift className="h-3.5 w-3.5" /> : <Percent className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{adj.label}</span>
                    <span className="tabular">{czk(adj.amount)}</span>
                  </li>
                ))}
              </ul>
              <Divider className="my-3" />
              <div className="flex items-center justify-between">
                <span className="font-medium">Celkem</span>
                <span className="text-xl font-semibold tabular">{czk(total)}</span>
              </div>
              {booking.deposit_amount > 0 && <p className="mt-1 text-xs text-fg-subtle">Vyžadovaná záloha: {czk(booking.deposit_amount)}</p>}

              {isOps && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {(rewards.data ?? []).map((reward) => (
                    <Button key={reward.id} variant="soft" size="sm" onClick={() => redeem.mutate(reward.id)} loading={redeem.isPending} leading={<Gift className="h-4 w-4" />} disabled={!active}>
                      Uplatnit odměnu
                    </Button>
                  ))}
                </div>
              )}
              {isOps && active && (
                <div className="mt-3 flex gap-2">
                  <Input placeholder="Promo kód" value={promo} onChange={(event) => setPromo(event.target.value.toUpperCase())} inputSize="sm" />
                  <Button variant="secondary" size="sm" disabled={!promo} loading={applyPromo.isPending} onClick={() => applyPromo.mutate(undefined as never)}>
                    Uplatnit
                  </Button>
                </div>
              )}
            </div>

            <div className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold">Platby</h4>
                {balance <= 0 && total > 0 ? <Badge tone="success" dot>Uhrazeno</Badge> : paid > 0 ? <Badge tone="warning" dot>Zbývá {czk(balance)}</Badge> : <Badge tone="neutral">Neuhrazeno</Badge>}
              </div>
              <ProgressBar value={total > 0 ? (paid / total) * 100 : 0} tone={balance <= 0 ? "success" : "accent"} />
              <ul className="mt-4 space-y-2">
                {booking.payments.length === 0 && <li className="text-sm text-fg-muted">Zatím žádná platba.</li>}
                {booking.payments.map((payment) => (
                  <li key={payment.id} className="flex items-center gap-3 text-sm">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-2 text-fg-muted">
                      <CircleDollarSign className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">
                        {payment.kind === "tip" ? "Spropitné" : payment.kind === "refund" ? "Vrácení" : payment.kind === "deposit" ? "Záloha" : "Platba"} · {paymentMethod[payment.method]}
                      </span>
                      <span className="block text-xs text-fg-subtle">{formatDateTime(payment.paid_at, salon.timezone)}</span>
                    </span>
                    <span className={payment.amount < 0 ? "font-semibold tabular text-danger" : "font-semibold tabular"}>{czk(payment.amount)}</span>
                  </li>
                ))}
              </ul>
              {tips > 0 && <p className="mt-2 text-xs text-fg-subtle">Spropitné celkem {czk(tips)}</p>}
            </div>

            {isOps && (
              <div className="p-5">
                <h4 className="mb-3 text-sm font-semibold">Interní poznámka</h4>
                <Textarea rows={3} value={internal} onChange={(event) => setInternal(event.target.value)} placeholder="Poznámka vidí jen váš tým" />
                <div className="mt-2 flex justify-end">
                  <Button variant="secondary" size="sm" disabled={internal === (booking.internal_note ?? "")} loading={saveNote.isPending} onClick={() => saveNote.mutate(undefined as never)}>
                    Uložit poznámku
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Sheet>

      {booking && dialog === "pay" && <PaymentDialog booking={booking} balance={balance} onClose={() => setDialog(null)} onDone={refresh} />}
      {booking && dialog === "move" && <MoveDialog booking={booking} onClose={() => setDialog(null)} onDone={refresh} />}
      {booking && dialog === "cancel" && <CancelDialog booking={booking} onClose={() => setDialog(null)} onDone={refresh} />}
    </>
  );
}

function PaymentDialog({ booking, balance, onClose, onDone }: { booking: Detail; balance: number; onClose: () => void; onDone: () => void }) {
  const { salon, hasFeature } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const [amount, setAmount] = useState(String(Math.max(0, balance) / 100));
  const [method, setMethod] = useState("card");
  const [tip, setTip] = useState("");
  const [code, setCode] = useState("");

  const pay = useMutation({
    mutationFn: async () => {
      const halere = Math.round(Number(amount.replace(",", ".")) * 100);
      if (method === "voucher") {
        const { error } = await sb.rpc("redeem_voucher", { p_salon: salon.id, p_code: code, p_amount: halere, p_booking: booking.id });
        if (error) throw error;
        return;
      }
      const tipHalere = tip ? Math.round(Number(tip.replace(",", ".")) * 100) : 0;
      const { error } = await sb.rpc("record_payment", { p_booking: booking.id, p_amount: halere, p_method: method, p_tip: tipHalere, p_note: null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Platba zapsána");
      onDone();
      onClose();
    },
    onError: (error) => toast.error("Platbu se nepodařilo zapsat", errorMessage(error)),
  });

  const methods = ["card", "cash", "qr", "bank_transfer", ...(hasFeature("vouchers") ? ["voucher"] : []), "other"];

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Přijmout platbu"
      description={`Zbývá zaplatit ${czk(balance)}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button loading={pay.isPending} disabled={!amount || Number(amount.replace(",", ".")) <= 0 || (method === "voucher" && !code)} onClick={() => pay.mutate()}>
            Zapsat platbu
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-3 gap-2">
          {methods.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMethod(value)}
              className={`rounded-md border px-2 py-2.5 text-sm font-medium transition-all ${method === value ? "border-accent bg-accent-soft text-accent" : "border-border hover:border-border-strong hover:bg-surface-2"}`}
            >
              {paymentMethod[value]}
            </button>
          ))}
        </div>
        <Field label="Částka (Kč)">
          <div className="flex gap-2">
            <Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} inputSize="lg" />
            <Button variant="secondary" onClick={() => setAmount(String(balance / 100))}>
              Vše
            </Button>
          </div>
        </Field>
        {method === "voucher" ? (
          <Field label="Kód poukazu">
            <Input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX" />
          </Field>
        ) : (
          <Field label="Spropitné (Kč)" hint="Nepočítá se do ceny služby">
            <Input inputMode="decimal" value={tip} onChange={(event) => setTip(event.target.value)} placeholder="0" />
          </Field>
        )}
      </div>
    </Dialog>
  );
}

function MoveDialog({ booking, onClose, onDone }: { booking: Detail; onClose: () => void; onDone: () => void }) {
  const { salon } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const staff = useStaff();
  const start = toLocal(booking.starts_at, salon.timezone);
  const [day, setDay] = useState(start.day);
  const [time, setTime] = useState(start.time);
  const [staffId, setStaffId] = useState(booking.primary_staff_id ?? "");

  const move = useMutation({
    mutationFn: async () => {
      const { error } = await sb.rpc("move_booking", { p_booking: booking.id, p_new_start: localToISO(day, time, salon.timezone), p_new_staff: staffId && staffId !== booking.primary_staff_id ? staffId : null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Termín přesunut");
      onDone();
      onClose();
    },
    onError: (error) => toast.error("Termín se nepodařilo přesunout", errorMessage(error)),
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Přesunout termín"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button loading={move.isPending} onClick={() => move.mutate()}>
            Přesunout
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Datum">
            <DatePicker value={day} onChange={setDay} />
          </Field>
          <Field label="Čas">
            <Input type="time" step={300} value={time} onChange={(event) => setTime(event.target.value)} />
          </Field>
        </div>
        <Field label="Pracovník">
          <Select value={staffId} onChange={(event) => setStaffId(event.target.value)}>
            {(staff.data ?? []).filter((s) => s.bookable).map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-sm text-fg-muted">Klient dostane upozornění o změně termínu.</p>
      </div>
    </Dialog>
  );
}

function CancelDialog({ booking, onClose, onDone }: { booking: Detail; onClose: () => void; onDone: () => void }) {
  const sb = useSb();
  const toast = useToast();
  const [by, setBy] = useState("cancelled_by_client");
  const [reason, setReason] = useState("");
  const cancel = useMutation({
    mutationFn: async () => {
      const { error } = await sb.rpc("set_booking_status", { p_booking: booking.id, p_status: by, p_reason: reason || null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rezervace zrušena");
      onDone();
      onClose();
    },
    onError: (error) => toast.error("Rezervaci se nepodařilo zrušit", errorMessage(error)),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Zrušit rezervaci"
      description="Termín se uvolní a klient dostane upozornění."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Ponechat
          </Button>
          <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>
            Zrušit rezervaci
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Kdo ruší?">
          <Select value={by} onChange={(event) => setBy(event.target.value)}>
            <option value="cancelled_by_client">Klient</option>
            <option value="cancelled_by_salon">Salon</option>
          </Select>
        </Field>
        <Field label="Důvod (nepovinný)">
          <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
