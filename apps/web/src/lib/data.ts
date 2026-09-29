"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSalon } from "@/components/app/salon-context";
import { getSupabase } from "./supabase/client";

export function useSb(): SupabaseClient {
  return useMemo(() => getSupabase() as unknown as SupabaseClient, []);
}

export interface ServiceRow {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  duration_min: number;
  buffer_after_min: number;
  price: number;
  price_is_from: boolean;
  vat_rate: number;
  online_bookable: boolean;
  counts_for_loyalty: boolean;
  color: string | null;
  sort: number;
  archived_at: string | null;
}

export interface CategoryRow {
  id: string;
  name: string;
  sort: number;
  archived_at: string | null;
}

export interface StaffRow {
  id: string;
  user_id: string | null;
  display_name: string;
  title: string | null;
  bio: string | null;
  photo_path: string | null;
  color: string;
  bookable: boolean;
  sort: number;
  archived_at: string | null;
  locations: string[];
  services: Record<string, { price_override: number | null; duration_override: number | null }>;
}

export function useServices(includeArchived = false) {
  const { salon } = useSalon();
  const sb = useSb();
  return useQuery({
    queryKey: ["services", salon.id, includeArchived],
    queryFn: async () => {
      let query = sb.from("services").select("*").eq("salon_id", salon.id).order("sort").order("name");
      if (!includeArchived) query = query.is("archived_at", null);
      const [services, categories] = await Promise.all([
        query,
        sb.from("service_categories").select("*").eq("salon_id", salon.id).is("archived_at", null).order("sort").order("name"),
      ]);
      if (services.error) throw services.error;
      return { services: (services.data ?? []) as ServiceRow[], categories: (categories.data ?? []) as CategoryRow[] };
    },
  });
}

export function useStaff(includeArchived = false) {
  const { salon } = useSalon();
  const sb = useSb();
  return useQuery({
    queryKey: ["staff", salon.id, includeArchived],
    queryFn: async () => {
      let query = sb.from("staff").select("*, staff_locations(location_id), staff_services(service_id, price_override, duration_override)").eq("salon_id", salon.id).order("sort").order("display_name");
      if (!includeArchived) query = query.is("archived_at", null);
      const { data, error } = await query;
      if (error) throw error;
      return ((data ?? []) as any[]).map(
        (row): StaffRow => ({
          ...row,
          locations: (row.staff_locations ?? []).map((l: any) => l.location_id),
          services: Object.fromEntries((row.staff_services ?? []).map((s: any) => [s.service_id, { price_override: s.price_override, duration_override: s.duration_override }])),
        }),
      );
    },
  });
}

export interface ClientListRow {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  created_at: string;
  customer_account_id: string | null;
  stats: {
    visits_count: number;
    total_spent: number;
    last_visit_at: string | null;
    avg_interval_days: number | null;
    next_expected_at: string | null;
    no_show_count: number;
    favorite_staff_id: string | null;
    favorite_service_id: string | null;
  } | null;
}

export function useClients(search = "", limit = 30) {
  const { salon } = useSalon();
  const sb = useSb();
  return useQuery({
    queryKey: ["clients", salon.id, search, limit],
    placeholderData: (previous) => previous,
    queryFn: async () => {
      let query = sb
        .from("clients")
        .select("id,first_name,last_name,full_name,phone,email,birthday,created_at,customer_account_id, stats:client_stats(visits_count,total_spent,last_visit_at,avg_interval_days,next_expected_at,no_show_count,favorite_staff_id,favorite_service_id)")
        .eq("salon_id", salon.id)
        .is("merged_into", null)
        .is("anonymized_at", null)
        .order("full_name")
        .limit(limit);
      const term = search.trim().replace(/[%,()]/g, "");
      if (term) {
        query = query.or(`full_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return ((data ?? []) as any[]).map((row) => ({ ...row, stats: Array.isArray(row.stats) ? (row.stats[0] ?? null) : row.stats })) as ClientListRow[];
    },
  });
}

export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : String(error);
  const map: [RegExp, string][] = [
    [/slot_taken/, "Tento termín je už obsazený."],
    [/slot_unavailable/, "Termín už není dostupný."],
    [/time_off_conflict/, "V tomto období má pracovník rezervace."],
    [/plan_limit_staff/, "Váš tarif neumožňuje další pracovníky."],
    [/plan_limit_locations/, "Váš tarif neumožňuje další pobočky."],
    [/plan_feature_(\w+)/, "Tato funkce není součástí vašeho tarifu."],
    [/overpayment/, "Částka je vyšší než zbývá zaplatit."],
    [/invalid_amount/, "Neplatná částka."],
    [/invalid_transition/, "Tuto změnu stavu nelze provést."],
    [/invalid_status/, "Tuto akci nelze v aktuálním stavu provést."],
    [/forbidden|permission denied|row-level security/, "K této akci nemáte oprávnění."],
    [/reward_unavailable/, "Odměna už není k dispozici."],
    [/reward_service_missing/, "Rezervace neobsahuje službu, na kterou se odměna vztahuje."],
    [/reward_already_applied/, "U této rezervace už je odměna uplatněná."],
    [/voucher_not_found/, "Poukaz s tímto kódem neexistuje."],
    [/voucher_unavailable/, "Poukaz už není platný."],
    [/promo_unavailable/, "Promo kód není platný."],
    [/promo_already_applied/, "Promo kód už je uplatněný."],
    [/promo_not_applicable/, "Promo kód nelze u této rezervace použít."],
    [/billing_profile_incomplete/, "Doplňte fakturační údaje v nastavení (název, IČO, adresa)."],
    [/vat_rate_not_allowed/, "Neplátce DPH nemůže fakturovat s DPH."],
    [/invoice_empty/, "Faktura nemá žádné položky."],
    [/invoice_immutable/, "Vystavený doklad už nelze upravit."],
    [/credit_exceeds_invoice/, "Dobropis nesmí přesáhnout hodnotu faktury."],
    [/session_already_open/, "Pokladní směna už je otevřená."],
    [/duplicate key|unique/i, "Takový záznam už existuje."],
    [/cancel_deadline_passed/, "Storno lhůta už uplynula."],
    [/verification_required/, "Je potřeba ověřit e-mail."],
    [/already_clocked_in/, "Už jste přihlášeni v docházce."],
    [/not_clocked_in/, "V docházce nejste přihlášeni."],
    [/nothing_to_pay/, "Není co vyplácet."],
    [/feature_unavailable/, "Tato funkce není v tarifu salonu dostupná."],
    [/too_many_bookings/, "Dosáhli jste limitu aktivních rezervací nebo čekání."],
    [/service_not_bookable/, "Vybranou službu nelze rezervovat online."],
    [/invalid_range/, "Neplatné období."],
    [/unsupported_items/, "Více služeb lze rezervovat jen u jednoho specialisty."],
    [/booking_not_found/, "Rezervace nebyla nalezena."],
  ];
  for (const [pattern, message] of map) {
    if (pattern.test(raw)) return message;
  }
  return raw || "Něco se nepovedlo.";
}
