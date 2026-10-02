import Link from "next/link";
import { Button } from "@/components/ui/button";

/** An idea opens the Brief studio with its title and description as the first message. */
export function InspirationExploreButton({
  title,
  description,
  label = "Explore",
  variant = "secondary",
}: {
  title: string;
  description: string;
  label?: string;
  variant?: "secondary" | "primary";
}) {
  return (
    <Button asChild size="sm" variant={variant}>
      <Link href={`/brief/new?${new URLSearchParams({ q: `${title}\n\n${description}`.trim() })}`}>{label}</Link>
    </Button>
  );
}
