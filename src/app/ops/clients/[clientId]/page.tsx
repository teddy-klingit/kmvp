import { redirect } from "next/navigation";

export default async function ClientWorkspaceIndex({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  redirect(`/ops/clients/${clientId}/dashboard`);
}
