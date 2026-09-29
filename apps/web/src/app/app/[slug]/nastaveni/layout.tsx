import { SettingsShell } from "@/components/settings/settings-shell";

export default function Layout({ children }: LayoutProps<"/app/[slug]/nastaveni">) {
  return <SettingsShell>{children}</SettingsShell>;
}
