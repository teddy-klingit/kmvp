import { redirect } from "next/navigation";
import { getPortalViewer } from "@/lib/current-viewer";
import { OnboardingWizard } from "@/components/portal/onboarding-wizard";

export default async function OnboardingPage() {
  const viewer = await getPortalViewer();
  if (viewer.client.onboardingCompletedAt) redirect("/dashboard");

  return <OnboardingWizard brandName={viewer.client.name} industry={viewer.client.industry ?? ""} />;
}
