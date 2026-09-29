import type { Metadata } from "next";
import { LocationsSettings } from "@/components/settings/locations";

export const metadata: Metadata = { title: "Pobočky" };

export default function Page() {
  return <LocationsSettings />;
}
