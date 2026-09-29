import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Přihlášení" };

export default function LoginPage() {
  const demo = process.env.NODE_ENV !== "production" && !!process.env.DEMO_EMAIL && !!process.env.DEMO_PASSWORD;
  return (
    <Suspense>
      <LoginForm demo={demo} />
    </Suspense>
  );
}
