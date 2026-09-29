import { AcceptInvite } from "@/components/team/accept-invite";

export default async function Page({ params }: PageProps<"/pozvanka/[token]">) {
  const { token } = await params;
  return <AcceptInvite token={token} />;
}
