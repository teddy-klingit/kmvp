import { RouteChips } from "@/components/ds/route-chips";

/** Output library: All · Top performers · By campaign. */
export function LibraryChips() {
  return (
    <RouteChips
      label="Library views"
      items={[
        { label: "All", href: "/library" },
        { label: "Top performers", href: "/library/top-performers" },
        { label: "By campaign", href: "/library/by-campaign" },
      ]}
    />
  );
}
