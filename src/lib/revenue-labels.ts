/** How each data source is named on a chip (safe to import in client components). */
export const SOURCE_LABEL: Record<string, string> = { Google: "Google Ads", Offline: "Uploaded", GA4: "GA4" };
export const sourceLabel = (s: string) => SOURCE_LABEL[s] ?? s;
