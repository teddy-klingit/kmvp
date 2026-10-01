import { Card } from "@/components/ui/card";

export function LiveStatusCard({ title, message }: { title: string; message: string }) {
  return (
    <Card className="flex animate-in fade-in slide-in-from-bottom-1 items-center gap-3 border-l-4 border-l-primary bg-info-soft/40 p-4 duration-300">
      <span className="relative flex size-3 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
        <span className="relative inline-flex size-3 rounded-full bg-primary" />
      </span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </Card>
  );
}
