import type { Metadata } from "next";
import { MyResults } from "@/components/team/my-results";

export const metadata: Metadata = { title: "Moje výsledky" };

export default function Page() {
  return <MyResults />;
}
