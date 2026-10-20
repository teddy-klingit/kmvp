/**
 * Phase V: Settings → Connections → Sales & revenue. Where the client's sales happen (shop, CRM, email), so Insights
 * can follow a click all the way to revenue. Read-only, totals only (counts and amounts per day × channel ×
 * campaign), never personal data; disconnect any time and the synced numbers are deleted within 30 days.
 *
 * For now these are demo connections (approved 2026-10-20): a demo client signs in with a simulated login, like
 * Drive and Notion; a real client's "Connect" asks Klingit to set it up. Safe to import in client components.
 */

export type SalesSourceKey = "Shopify" | "HubSpot" | "Klaviyo" | "Salesforce" | "Pipedrive" | "Dynamics";

export const SALES_SOURCES: { key: SalesSourceKey; name: string; description: string; monogram: string; tone: string; kind: "shop" | "crm" | "email"; soon?: true }[] = [
  { key: "Shopify", name: "Shopify", description: "Online orders and revenue per campaign", monogram: "S", tone: "bg-[#E4F2B3] text-[#5E6B2A]", kind: "shop" },
  { key: "HubSpot", name: "HubSpot", description: "Retail and wholesale leads, deals and pipeline", monogram: "H", tone: "bg-[#FEECE5] text-[#B8460F]", kind: "crm" },
  { key: "Klaviyo", name: "Klaviyo", description: "Email and SMS: sends, clicks, revenue per flow", monogram: "K", tone: "bg-brand-chip text-brand-ink", kind: "email" },
  { key: "Salesforce", name: "Salesforce", description: "Leads, opportunities and revenue", monogram: "SF", tone: "bg-[#E4EAF6] text-[#3B6FB6]", kind: "crm", soon: true },
  { key: "Pipedrive", name: "Pipedrive", description: "Deals and pipeline", monogram: "P", tone: "bg-brand-chip text-brand-ink", kind: "crm", soon: true },
  { key: "Dynamics", name: "Microsoft Dynamics 365", description: "Leads, opportunities and revenue", monogram: "D", tone: "bg-[#E4EAF6] text-[#3B6FB6]", kind: "crm", soon: true },
];
export const salesSource = (key: string) => SALES_SOURCES.find((s) => s.key === key);
export const isSalesSource = (key: string): key is SalesSourceKey => SALES_SOURCES.some((s) => s.key === key);

/** Klingit's stages: every client's CRM is counted the same way. */
export const KLINGIT_STAGES = [
  { key: "new_lead", label: "New lead" },
  { key: "qualified", label: "Qualified lead" },
  { key: "deal", label: "Deal" },
  { key: "customer", label: "Customer · revenue" },
  { key: "lost", label: "Lost" },
] as const;
export type KlingitStage = (typeof KLINGIT_STAGES)[number]["key"];

/** Pre-fills the mapping from the stage's own name. */
export function guessStage(name: string): KlingitStage {
  const n = name.toLowerCase();
  if (/lost|disqualif|dead/.test(n)) return "lost";
  if (/won|customer|closed|paid/.test(n)) return "customer";
  if (/proposal|contract|negotiat|quote|deal|offer/.test(n)) return "deal";
  if (/qualified|mql|sql|meeting|demo|booked/.test(n)) return "qualified";
  return "new_lead";
}

export type SalesSettings = {
  /** Where the set-up is: 1 log in, 2 map stages (CRMs), 3 choose what to sync. */
  step?: 1 | 2 | 3;
  login?: string;
  domain?: string;
  stages?: { name: string; deals12m: number; mapTo: KlingitStage }[];
  pipelines?: { name: string; selected: boolean }[];
  currency?: string;
  historyMonths?: number;
};
export type SalesHealth = { withSource: number; of: "orders" | "deals" };

/** Steps for a source: a CRM maps its stages; a shop or email tool goes straight to what to sync. */
export const stepsFor = (key: SalesSourceKey) => (salesSource(key)?.kind === "crm" ? (["Log in", "Map your stages", "Choose what to sync"] as const) : (["Log in", "Choose what to sync"] as const));

/** What a demo account finds when it signs in (the ConnectCRM design's numbers). */
export const DEMO_ACCOUNT: Record<"Shopify" | "HubSpot" | "Klaviyo", { domain?: string; stages?: { name: string; deals12m: number }[]; pipelines: string[]; currency: string; health?: SalesHealth }> = {
  Shopify: { domain: "ouhers.com", pipelines: ["Online store"], currency: "EUR", health: { withSource: 0.97, of: "orders" } },
  HubSpot: {
    stages: [
      { name: "Lead", deals12m: 1240 },
      { name: "Marketing qualified lead", deals12m: 410 },
      { name: "Meeting booked", deals12m: 168 },
      { name: "Proposal sent", deals12m: 74 },
      { name: "Closed won", deals12m: 31 },
      { name: "Closed lost", deals12m: 22 },
    ],
    pipelines: ["Retail", "Wholesale"],
    currency: "EUR",
    health: { withSource: 0.82, of: "deals" },
  },
  Klaviyo: { pipelines: ["Campaigns", "Flows"], currency: "EUR" },
};

export const PROMISES = [
  { title: "Read-only.", text: "Klingit never writes to your CRM or shop." },
  { title: "Totals only.", text: "Counts and amounts per campaign and week. No names, emails or phone numbers." },
  { title: "Disconnect any time.", text: "Your synced data is deleted within 30 days." },
];

/** Synced numbers are deleted this long after a disconnect. */
export const PURGE_AFTER_DAYS = 30;
