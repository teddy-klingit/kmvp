import { FilterChips } from "@/components/ds/filter-chips";

/** Needs you · Inbox: the inbox is a filter of the PM home, not its own nav item. */
export function NeedsYouChips({ active, needs, inbox }: { active: "needs" | "inbox"; needs: number; inbox: number }) {
  return (
    <FilterChips
      label="Needs you views"
      items={[
        { label: "Needs you", href: "/ops", active: active === "needs", count: needs },
        { label: "Inbox", href: "/ops/inbox", active: active === "inbox", count: inbox },
      ]}
    />
  );
}
