import type { Metadata } from "next";
import { NotificationsSettings } from "@/components/settings/notifications-settings";

export const metadata: Metadata = { title: "Upozornění" };

export default function Page() {
  return <NotificationsSettings />;
}
