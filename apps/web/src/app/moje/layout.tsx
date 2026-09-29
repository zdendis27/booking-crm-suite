import Link from "next/link";
import { LogOut } from "lucide-react";
import { Logo } from "@repo/ui";
import { brand } from "@repo/copy";
import { ThemeToggle } from "@/components/theme-toggle";

export default function CustomerLayout({ children }: LayoutProps<"/moje">) {
  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/moje">
            <Logo name={brand.name} size={28} />
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <form action="/auth/signout" method="post">
              <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-fg-muted transition hover:bg-surface-2 hover:text-fg">
                <LogOut className="size-4" /> <span className="hidden sm:inline">Odhlásit</span>
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-6 pb-24">{children}</div>
    </div>
  );
}
