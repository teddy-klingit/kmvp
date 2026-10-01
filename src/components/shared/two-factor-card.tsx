import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toggleTwoFactorAction } from "@/lib/actions/two-factor-actions";

export function TwoFactorCard({ enabled, path }: { enabled: boolean; path: string }) {
  return (
    <Card className="flex items-center justify-between gap-4 p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-info-soft text-primary">
          <ShieldCheck className="size-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">Two-factor authentication</p>
          <p className="text-sm text-muted-foreground">Require a one-time code in addition to your password.</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Badge tone={enabled ? "success" : "neutral"}>{enabled ? "Enabled" : "Disabled"}</Badge>
        <form action={toggleTwoFactorAction}>
          <input type="hidden" name="enable" value={(!enabled).toString()} />
          <input type="hidden" name="path" value={path} />
          <Button type="submit" size="sm" variant="secondary">
            {enabled ? "Disable" : "Enable"}
          </Button>
        </form>
      </div>
    </Card>
  );
}
