import type { Metadata } from "next";
import { MiniWebSettings } from "@/components/settings/mini-web";

export const metadata: Metadata = { title: "Mini web" };

export default function Page() {
  return <MiniWebSettings />;
}
