export function ThinkingBubble({ label = "Thinking…" }: { label?: string }) {
  return (
    <div className="flex animate-in fade-in items-center gap-3 rounded-2xl bg-accent-soft/50 px-4 py-3.5 duration-200">
      <span className="flex size-7 shrink-0 animate-pulse items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-ink">
        AI
      </span>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="flex gap-1">
          <span className="size-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.3s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.15s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-accent" />
        </span>
      </div>
    </div>
  );
}
