import type { Metadata } from "next";
import { StaffDetail } from "@/components/team/staff-detail";

export const metadata: Metadata = { title: "Pracovník" };

export default async function Page({ params }: PageProps<"/app/[slug]/tym/[id]">) {
  const { id } = await params;
  return <StaffDetail staffId={id} />;
}
