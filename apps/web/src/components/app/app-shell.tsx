"use client";

import { brand, salonRole } from "@repo/copy";
import { Avatar, Badge, Button, LogoMark, Menu, Select, Sheet, cn } from "@repo/ui";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ChevronsUpDown, Lock, LogOut, MapPin, Menu as MenuIcon, Plus, Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { ThemeToggle } from "../theme-toggle";
import { AppIntro } from "./app-intro";
import { NotificationBell } from "./notification-bell";
import { mobilePrimary, navGroups, settingsItem, type NavGroup, type NavItem } from "./nav";
import { useSalon } from "./salon-context";

function useNavItems() {
  const { can } = useSalon();
  return navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => can(item.roles)) }))
    .filter((group) => group.items.length > 0);
}

function isActive(pathname: string, base: string, item: NavItem) {
  const target = `${base}${item.href}`;
  return item.href === "" ? pathname === target : pathname === target || pathname.startsWith(`${target}/`);
}

function GroupHeading({ group, className }: { group: NavGroup; className?: string }) {
  return (
    <p className={cn("mb-2 flex items-center gap-2 px-2 text-xs font-extrabold uppercase tracking-wider", className)} style={{ color: group.color }}>
      <group.icon className="size-4" strokeWidth={2.5} />
      {group.label}
    </p>
  );
}

function NavChip({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <span
      className="relative grid size-8 shrink-0 place-items-center rounded-lg transition-all duration-300 group-hover:scale-110 group-hover:-rotate-3"
      style={active ? { background: item.color, color: "#fff", boxShadow: `0 6px 14px -6px ${item.color}` } : { background: `color-mix(in srgb, ${item.color} 14%, transparent)`, color: item.color }}
    >
      <item.icon className="h-[17px] w-[17px]" />
    </span>
  );
}

function NavLink({ item, base, onNavigate, layoutId, index = 0 }: { item: NavItem; base: string; onNavigate?: () => void; layoutId: string; index?: number }) {
  const pathname = usePathname();
  const { hasFeature } = useSalon();
  const active = isActive(pathname, base, item);
  const locked = item.feature && !hasFeature(item.feature);
  return (
    <Link
      href={`${base}${item.href}`}
      onClick={onNavigate}
      style={{ animationDelay: `${120 + index * 45}ms` }}
      className={cn(
        "ui-enter-x group relative flex items-center gap-3 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
        active ? "text-fg" : "text-fg-muted hover:text-fg",
      )}
    >
      {active && (
        <motion.span
          layoutId={layoutId}
          className="absolute inset-0 rounded-md bg-accent-soft"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      )}
      {!active && <span className="absolute inset-0 rounded-md bg-surface-2 opacity-0 transition-opacity group-hover:opacity-100" />}
      <NavChip item={item} active={active} />
      <span className="relative flex-1 truncate">{item.label}</span>
      {locked && <Lock className="relative h-3.5 w-3.5 text-fg-subtle" />}
    </Link>
  );
}

function SalonSwitcher() {
  const { salon, userId } = useSalon();
  const router = useRouter();
  const query = useQuery({
    queryKey: ["my-salons", userId],
    queryFn: async () => {
      const { data, error } = await getSupabase().from("memberships").select("role, salon:salons(id,name,slug)").eq("user_id", userId);
      if (error) throw error;
      return (data ?? []) as unknown as { role: string; salon: { id: string; name: string; slug: string } }[];
    },
  });
  const items = [
    ...(query.data ?? []).map((row) => ({
      label: row.salon.name,
      icon: <span className="flex h-5 w-5 items-center justify-center rounded-[6px] bg-accent-soft text-[10px] font-bold text-accent">{row.salon.name[0]}</span>,
      onSelect: () => router.push(`/app/${row.salon.slug}`),
    })),
    { separator: true, label: "" },
    { label: "Založit další salon", icon: <Plus />, onSelect: () => router.push("/zalozit-salon") },
  ];
  return (
    <Menu
      align="start"
      className="w-64"
      items={items}
      trigger={
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-md border border-border bg-surface p-2.5 text-left shadow-xs transition-all hover:border-border-strong hover:shadow-sm"
        >
          <LogoMark size={36} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{salon.name}</span>
            <span className="block truncate text-xs text-fg-subtle">{brand.name}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-fg-subtle" />
        </button>
      }
    />
  );
}

function UserMenu() {
  const { userName, userEmail, role, salon } = useSalon();
  const router = useRouter();
  async function signOut() {
    await fetch("/auth/signout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }
  return (
    <Menu
      items={[
        { label: <span className="block"><span className="block text-sm font-semibold">{userName}</span><span className="block text-xs font-normal text-fg-subtle">{userEmail}</span></span>, disabled: true },
        { separator: true, label: "" },
        { label: "Zákaznický účet", icon: <UserRound />, onSelect: () => router.push("/moje") },
        { label: "Nastavení salonu", icon: <Settings />, onSelect: () => router.push(`/app/${salon.slug}/nastaveni`), disabled: !["owner", "manager"].includes(role) },
        { separator: true, label: "" },
        { label: "Odhlásit se", icon: <LogOut />, onSelect: signOut, danger: true },
      ]}
      trigger={
        <button type="button" className="rounded-full outline-none ring-offset-2 ring-offset-bg transition-shadow hover:ring-2 hover:ring-accent/40" aria-label="Uživatelské menu">
          <Avatar name={userName || userEmail} size={36} />
        </button>
      }
    />
  );
}

function LocationPicker({ className }: { className?: string }) {
  const { locations, locationId, setLocationId } = useSalon();
  if (locations.length < 2) return null;
  return (
    <div className={cn("relative w-44", className)}>
      <MapPin className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
      <Select value={locationId} onChange={(event) => setLocationId(event.target.value)} className="h-9 pl-9" aria-label="Pobočka">
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
          </option>
        ))}
      </Select>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { salon, role, planName, can, locations } = useSalon();
  const groups = useNavItems();
  const base = `/app/${salon.slug}`;
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const flat = groups.flatMap((group) => group.items);
  const primary = mobilePrimary.map((href) => flat.find((item) => item.href === href)).filter(Boolean) as NavItem[];
  const moreActive = !primary.some((item) => isActive(pathname, base, item));

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]">
      <AppIntro name={salon.name} />
      <aside className="ui-enter-x sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface/70 p-4 backdrop-blur lg:flex">
        <SalonSwitcher />
        <nav className="ui-scroll mt-6 flex-1 space-y-6 overflow-y-auto pr-1">
          {groups.map((group, groupIndex) => (
            <div key={group.label}>
              <GroupHeading group={group} />
              <div className="space-y-0.5">
                {group.items.map((item, itemIndex) => (
                  <NavLink key={item.href} item={item} base={base} layoutId="nav-pill-desktop" index={groupIndex * 4 + itemIndex} />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="mt-4 space-y-3">
          {can(settingsItem.roles) && <NavLink item={settingsItem} base={base} layoutId="nav-pill-desktop" index={16} />}
          <Link href={`${base}/nastaveni/tarif`} className="block rounded-lg bg-[image:var(--gradient-soft)] p-3.5 transition-shadow hover:shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-fg-muted">Váš tarif</span>
              <Badge tone="accent">{planName}</Badge>
            </div>
            <p className="mt-1.5 text-xs text-fg-muted">Roli {salonRole[role]?.toLowerCase()} máte v salonu {salon.name}.</p>
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="ui-glass ui-enter-down sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border px-4 safe-top sm:px-6">
          <div className="flex items-center gap-2.5 lg:hidden">
            <LogoMark size={32} />
            <span className={cn("max-w-[9rem] truncate font-semibold", locations.length > 1 && "hidden sm:inline")}>{salon.name}</span>
          </div>
          <div className="hidden lg:block">
            <LocationPicker />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="lg:hidden">
              <LocationPicker className="w-32 sm:w-40" />
            </div>
            <ThemeToggle />
            <NotificationBell />
            <UserMenu />
          </div>
        </header>

        <main key={pathname} className="app-main mx-auto w-full max-w-[90rem] flex-1 px-4 py-6 pb-28 sm:px-6 lg:px-8 lg:pb-10">{children}</main>
      </div>

      <nav className="ui-glass fixed inset-x-0 bottom-0 z-40 border-t border-border lg:hidden safe-bottom" aria-label="Hlavní navigace">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {primary.map((item) => {
            const active = isActive(pathname, base, item);
            return (
              <Link key={item.href} href={`${base}${item.href}`} className="relative flex flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-[11px] font-medium">
                {active && <motion.span layoutId="mobile-pill" className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-[image:var(--gradient-brand)]" />}
                <item.icon className={cn("h-[22px] w-[22px] transition-all duration-300", active ? "-translate-y-0.5 scale-110" : "text-fg-subtle")} style={active ? { color: item.color } : undefined} />
                <span className={active ? "font-semibold text-fg" : "text-fg-subtle"}>{item.label}</span>
              </Link>
            );
          })}
          <button type="button" onClick={() => setMoreOpen(true)} className="relative flex flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-[11px] font-medium">
            <MenuIcon className={cn("h-[22px] w-[22px]", moreActive ? "text-accent" : "text-fg-subtle")} />
            <span className={moreActive ? "text-accent" : "text-fg-subtle"}>Více</span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen} title="Menu" description={salon.name} width="sm:w-[380px]">
        <div className="space-y-6 p-4">
          {groups.map((group) => (
            <div key={group.label}>
              <GroupHeading group={group} className="mb-2 px-1" />
              <div className="grid grid-cols-2 gap-2">
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={`${base}${item.href}`}
                    onClick={() => setMoreOpen(false)}
                    className="flex items-center gap-2.5 rounded-md border border-border bg-surface p-3 text-sm font-medium transition-colors hover:bg-surface-2"
                  >
                    <NavChip item={item} active={false} />
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
          {can(settingsItem.roles) && (
            <Link href={`${base}${settingsItem.href}`} onClick={() => setMoreOpen(false)} className="flex items-center gap-2.5 rounded-md border border-border p-3 text-sm font-medium hover:bg-surface-2">
              <NavChip item={settingsItem} active={false} />
              {settingsItem.label}
            </Link>
          )}
          <Button variant="secondary" className="w-full" leading={<Plus className="h-4 w-4" />} asChild>
            <Link href="/zalozit-salon" onClick={() => setMoreOpen(false)}>
              Založit další salon
            </Link>
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
