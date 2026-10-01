export const INTERNAL_ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  ACCOUNT_LEAD: "Account lead",
  ART_DIRECTOR: "Art director",
  COPYWRITER: "Copywriter",
  MOTION_DESIGNER: "Motion designer",
  PROJECT_MANAGER: "Project manager",
};

export const CLIENT_PERMISSION_LABEL: Record<string, string> = {
  OWNER: "Owner",
  APPROVER: "Approver",
  VIEWER: "Viewer",
};

export const PIPELINE_STAGE_LABEL: Record<string, string> = {
  BRIEF: "Brief",
  ESTIMATE: "Estimate",
  STAFFING: "Staffing",
  PRODUCTION: "Production",
  QA: "QA",
  FIRST_DRAFT_DELIVERY: "Delivery",
  FEEDBACK: "Feedback",
  FINAL_DELIVERY: "Final",
  ARCHIVE_LEARN_MEASURE: "Archive",
  SUGGESTIONS: "Suggestions",
};

export const PIPELINE_STAGE_ORDER = [
  "BRIEF",
  "ESTIMATE",
  "STAFFING",
  "PRODUCTION",
  "QA",
  "FIRST_DRAFT_DELIVERY",
  "FEEDBACK",
  "FINAL_DELIVERY",
  "ARCHIVE_LEARN_MEASURE",
  "SUGGESTIONS",
] as const;

export const PROJECT_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  BRIEFING: "Briefing",
  ESTIMATING: "Estimating",
  STAFFING: "Staffing",
  IN_PRODUCTION: "In production",
  QA: "In QA",
  AWAITING_REVIEW: "Awaiting review",
  IN_FEEDBACK: "In feedback",
  DELIVERED: "Delivered",
  PAUSED: "Paused",
  ARCHIVED: "Archived",
};

export const AGENT_CATEGORY_LABEL: Record<string, string> = {
  FOUNDATION: "Foundation",
  BRIEF: "Brief",
  ESTIMATE: "Estimate",
  STAFFING: "Staffing",
  PRODUCTION: "Production",
  QA: "QA",
  DELIVERY: "Delivery",
  FEEDBACK: "Feedback",
  ARCHIVE: "Archive",
};

export const PROJECT_TYPE_LABEL: Record<string, string> = {
  CAMPAIGN: "Campaign",
  SINGLE_ASSET: "Single asset",
  PRESENTATION: "Presentation / deck",
  MOTION_VIDEO: "Motion / video",
  DEVELOPMENT: "Development",
  BRAND_GUIDELINES: "Brand guidelines",
  OTHER: "Other",
};

// Fixed per-type color (not hashed) so the same type always reads the same
// way across the Projects board/list — matches the app's avatar palette.
export const PROJECT_TYPE_COLOR: Record<string, string> = {
  CAMPAIGN: "var(--avatar-3)",
  SINGLE_ASSET: "var(--avatar-4)",
  PRESENTATION: "var(--avatar-2)",
  MOTION_VIDEO: "var(--avatar-5)",
  DEVELOPMENT: "var(--avatar-7)",
  BRAND_GUIDELINES: "var(--avatar-1)",
  OTHER: "var(--avatar-6)",
};

// Lively, stage-specific copy for the "what's happening right now" indicator
// on the client Project Overview page.


export const PLAN_TIER_LABEL: Record<string, string> = {
  STARTER: "Starter",
  GROWTH: "Growth",
  SCALE: "Scale",
};
