"use client";

import { Button } from "@repo/ui";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

function currentTheme(): "light" | "dark" {
  const attribute = document.documentElement.getAttribute("data-theme");
  if (attribute === "dark" || attribute === "light") return attribute;
  return "light";
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    setTheme(currentTheme());
  }, []);

  function toggle() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem("theme", next);
    } catch {
      setTheme(next);
      return;
    }
    setTheme(next);
  }

  return (
    <Button variant="ghost" size="icon" onClick={toggle} className={className} aria-label="Přepnout tmavý režim">
      {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </Button>
  );
}
