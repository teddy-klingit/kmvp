import { redirect } from "next/navigation";

/** The old "Delivery" nav item jumped into one client's stage tab; projects now live on the board and in their cockpits. */
export default function OpsDeliveryIndexPage() {
  redirect("/ops/projects");
}
