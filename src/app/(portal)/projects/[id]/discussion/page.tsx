import { redirectLegacyTab } from "@/lib/legacy-tab-redirect";

export default async function LegacyTabPage({ params }: { params: Promise<{ id: string }> }) {
  return redirectLegacyTab("discussion", params);
}
