import { RouteChips } from "@/components/ds/route-chips";

/** Brand IQ → Library: All · Top performers · By campaign. */
export function LibraryChips() {
  return (
    <RouteChips
      label="Library views"
      items={[
        { label: "All", href: "/assets/library" },
        { label: "Top performers", href: "/assets/top-performers" },
        { label: "By campaign", href: "/assets/by-campaign" },
      ]}
    />
  );
}
