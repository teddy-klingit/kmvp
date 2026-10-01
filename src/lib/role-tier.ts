import type { InternalRole } from "@/generated/prisma";

/**
 * Collapses the granular staffing titles into the 3 view tiers that drive
 * ops navigation and the home dashboard: what a Project Manager needs to see
 * day to day is different from a Creator's or an Admin's, even though both
 * PROJECT_MANAGER and ACCOUNT_LEAD are coordination roles, and all three
 * creative titles share the same "my assignments" view.
 */
export type RoleTier = "ADMIN" | "PM" | "CREATOR";

export function roleTierFor(title: InternalRole): RoleTier {
  switch (title) {
    case "ADMIN":
      return "ADMIN";
    case "PROJECT_MANAGER":
    case "ACCOUNT_LEAD":
      return "PM";
    case "ART_DIRECTOR":
    case "COPYWRITER":
    case "MOTION_DESIGNER":
      return "CREATOR";
  }
}

export const ROLE_TIER_LABEL: Record<RoleTier, string> = {
  ADMIN: "Admin",
  PM: "Project Manager",
  CREATOR: "Creator",
};
