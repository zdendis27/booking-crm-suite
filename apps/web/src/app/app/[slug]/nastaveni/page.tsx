import { redirect } from "next/navigation";

export default async function Page({ params }: PageProps<"/app/[slug]/nastaveni">) {
  const { slug } = await params;
  redirect(`/app/${slug}/nastaveni/salon`);
}
