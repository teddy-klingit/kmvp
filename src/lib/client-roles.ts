import type { ClientPermission } from "@/generated/prisma";

/** A client's admin (Settings → Usage, plan, connections): the account owner. Everyone else is a member. */
export const isClientAdmin = (viewer: { permission: ClientPermission }) => viewer.permission === "OWNER";
export const clientRoleLabel = (viewer: { permission: ClientPermission }) => (isClientAdmin(viewer) ? "Admin" : "Member");
