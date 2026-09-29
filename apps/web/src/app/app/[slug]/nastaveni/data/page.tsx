import type { Metadata } from "next";
import { DataPrivacy } from "@/components/settings/data-privacy";

export const metadata: Metadata = { title: "Data a soukromí" };

export default function Page() {
  return <DataPrivacy />;
}
