import {
  Banknote,
  Bot,
  CalendarClock,
  CalendarDays,
  Gift,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Receipt,
  Scissors,
  Rocket,
  Settings,
  Star,
  Store,
  TrendingUp,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "./salon-context";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  feature?: string;
  color: string;
}

export interface NavGroup {
  label: string;
  icon: LucideIcon;
  color: string;
  items: NavItem[];
}

const all: Role[] = ["owner", "manager", "reception", "staff"];
const ops: Role[] = ["owner", "manager", "reception"];
const mgmt: Role[] = ["owner", "manager"];

export const navGroups: NavGroup[] = [
  {
    label: "Provoz",
    icon: CalendarClock,
    color: "#3056d3",
    items: [
      { href: "", label: "Přehled", icon: LayoutDashboard, roles: ops, color: "#3056d3" },
      { href: "/kalendar", label: "Kalendář", icon: CalendarDays, roles: all, color: "#16a34a" },
      { href: "/rezervace", label: "Rezervace", icon: ListChecks, roles: ops, color: "#06b6d4" },
      { href: "/klienti", label: "Klienti", icon: Users, roles: all, color: "#f97316" },
    ],
  },
  {
    label: "Peníze",
    icon: Wallet,
    color: "#16a34a",
    items: [
      { href: "/pokladna", label: "Pokladna", icon: Wallet, roles: ops, feature: "finance", color: "#16a34a" },
      { href: "/finance", label: "Finance", icon: TrendingUp, roles: mgmt, feature: "finance", color: "#3056d3" },
      { href: "/faktury", label: "Faktury", icon: Receipt, roles: ops, feature: "invoicing", color: "#d946ef" },
      { href: "/poukazy", label: "Poukazy", icon: Gift, roles: ops, feature: "vouchers", color: "#ec4899" },
    ],
  },
  {
    label: "Salon",
    icon: Store,
    color: "#f97316",
    items: [
      { href: "/sluzby", label: "Služby", icon: Scissors, roles: mgmt, color: "#f97316" },
      { href: "/tym", label: "Tým", icon: UserRound, roles: ops, color: "#4f46e5" },
      { href: "/vernost", label: "Věrnost", icon: Star, roles: ops, feature: "loyalty", color: "#eab308" },
    ],
  },
  {
    label: "Růst",
    icon: Rocket,
    color: "#d946ef",
    items: [
      { href: "/marketing", label: "Marketing", icon: Megaphone, roles: mgmt, color: "#ec4899" },
      { href: "/asistent", label: "AI asistent", icon: Bot, roles: mgmt, feature: "ai", color: "#7c3aed" },
      { href: "/moje-vysledky", label: "Moje výsledky", icon: Banknote, roles: ["staff"], feature: "commissions", color: "#16a34a" },
    ],
  },
];

export const settingsItem: NavItem = { href: "/nastaveni", label: "Nastavení", icon: Settings, roles: mgmt, color: "#64748b" };

export const mobilePrimary = ["", "/kalendar", "/klienti", "/pokladna"];
