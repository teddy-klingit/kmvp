"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GripVertical, Lock } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { AvatarStack } from "@/components/ds/avatar";
import { StatusDot } from "@/components/ds/status-dot";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { canPickUp, dragRule, type Lane } from "@/lib/board-rules";
import { LANES, type BoardCard } from "@/lib/projects-board";
import { reorderQueueAction, sendBriefFromBoardAction } from "@/lib/actions/projects-board-actions";

type Slots = { total: number; used: number };

const laneOf = (id: string, cards: BoardCard[]): Lane | null => (id.startsWith("lane:") ? (id.slice(5) as Lane) : cards.find((c) => c.id === id)?.lane ?? null);

/**
 * The client Projects board: tinted lanes in client-stage order. Two moves only (board-rules.ts): a draft to
 * Queued sends its brief, Queued cards reorder the queue. Keyboard: Space to pick up, arrows to move (Right
 * takes a draft straight to Queued), Space to drop, Escape to cancel.
 */
export function ProjectsBoard({ cards: initial, slots }: { cards: BoardCard[]; slots: Slots }) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [dragging, setDragging] = useState<BoardCard | null>(null);
  const [over, setOver] = useState<Lane | null>(null);
  const [confirm, setConfirm] = useState<BoardCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // The server's cards win again after every refresh.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setCards(initial);
  }

  const coordinates: KeyboardCoordinateGetter = (event, args) => {
    const active = args.active ? cards.find((c) => c.id === args.active) : null;
    if (active?.lane === "draft" && event.code === "ArrowRight") {
      const rect = args.context.droppableRects.get("lane:queued");
      if (rect) return { x: rect.left + rect.width / 2, y: rect.top + 80 };
    }
    return sortableKeyboardCoordinates(event, args);
  };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: coordinates }));

  const send = (card: BoardCard) => {
    setCards((cs) => cs.map((c) => (c.id === card.id ? { ...c, lane: "queued", status: { label: "Sending…", tone: "klingit" }, action: null, quality: null } : c)));
    startTransition(async () => {
      const r = await sendBriefFromBoardAction(card.id);
      if (!r.ok) setError(r.error ?? "Couldn't send that brief.");
      router.refresh();
    });
  };

  const onStart = (e: DragStartEvent) => setDragging(cards.find((c) => c.id === e.active.id) ?? null);
  const onOver = (e: DragOverEvent) => setOver(e.over ? laneOf(String(e.over.id), cards) : null);
  const onEnd = (e: DragEndEvent) => {
    setDragging(null);
    setOver(null);
    const card = cards.find((c) => c.id === e.active.id);
    const to = e.over ? laneOf(String(e.over.id), cards) : null;
    if (!card || !to) return;
    const rule = dragRule(card.lane, to);
    if (!rule.allowed) return;
    if (rule.kind === "send") {
      if ((card.quality ?? 0) < 50) setConfirm(card);
      else send(card);
      return;
    }
    const queue = cards.filter((c) => c.lane === "queued");
    const from = queue.findIndex((c) => c.id === card.id);
    const target = queue.findIndex((c) => c.id === e.over!.id);
    if (target < 0 || from === target) return;
    const next = arrayMove(queue, from, target).map((c, i) => ({ ...c, queuePosition: i + 1, foot: i === 0 ? "Next in line" : c.foot.replace(/^.*in line$/, `${i + 1}${i + 1 === 2 ? "nd" : i + 1 === 3 ? "rd" : "th"} in line`) }));
    setCards((cs) => [...cs.filter((c) => c.lane !== "queued"), ...next]);
    startTransition(async () => {
      await reorderQueueAction(next.map((c) => c.id));
      router.refresh();
    });
  };

  const rule = dragging && over ? dragRule(dragging.lane, over) : null;

  return (
    <>
      {error && (
        <p role="alert" className="m-0 rounded-[10px] bg-brand-peach-pale px-4 py-2.5 text-[14px]">
          {error}
        </p>
      )}
      <DndContext
        // A fixed id: dnd-kit's generated one differs between the server render and hydration.
        id="projects-board"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onStart}
        onDragOver={onOver}
        onDragEnd={onEnd}
        onDragCancel={() => {
          setDragging(null);
          setOver(null);
        }}
        accessibility={{
          announcements: {
            onDragStart: ({ active }) => `Picked up ${cards.find((c) => c.id === active.id)?.name ?? "project"}.`,
            onDragOver: ({ active, over: o }) => {
              const from = laneOf(String(active.id), cards);
              const to = o ? laneOf(String(o.id), cards) : null;
              if (!from || !to) return "";
              const r = dragRule(from, to);
              return r.allowed ? (r.kind === "send" ? "Over Queued: drop to send the brief." : "Moving in the queue.") : `${r.reason}.`;
            },
            onDragEnd: ({ over: o }) => (o ? "Dropped." : "Put back."),
            onDragCancel: () => "Cancelled.",
          },
          screenReaderInstructions: { draggable: "Press Space to pick up a draft or queued project. Arrow keys move it; Right moves a draft to Queued. Press Space again to drop it, Escape to cancel." },
        }}
      >
        {/* Under 1000px of content the lanes keep their width and the board scrolls inside itself, never the page. */}
        <div className={cn("-mx-4 overflow-x-auto px-4 pb-2 min-[900px]:mx-0 min-[900px]:px-0", rule && !rule.allowed && "cursor-not-allowed")}>
          <div className="grid min-w-[1180px] grid-cols-5 items-stretch gap-3 min-[1300px]:min-w-0">
            {LANES.map(({ lane, title, hint }) => {
              const items = cards.filter((c) => c.lane === lane).sort((a, b) => (lane === "queued" ? (a.queuePosition ?? 999) - (b.queuePosition ?? 999) : 0));
              const blocked = dragging && over === lane && !dragRule(dragging.lane, lane).allowed ? dragRule(dragging.lane, lane) : null;
              return (
                <LaneColumn key={lane} lane={lane} title={title} hint={hint} count={items.length} blockedReason={blocked && !blocked.allowed ? blocked.reason : null} accepting={Boolean(dragging && over === lane && dragRule(dragging.lane, lane).allowed && dragging.lane !== lane)}>
                  {lane === "active" && <SlotMeter slots={slots} />}
                  {lane === "queued" ? (
                    <SortableContext items={items.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                      {items.map((c, i) => (
                        <SortableCard key={c.id} card={c} first={i === 0} />
                      ))}
                    </SortableContext>
                  ) : (
                    items.map((c, i) => (canPickUp(lane) ? <DraggableCard key={c.id} card={c} first={i === 0} /> : <Card key={c.id} card={c} first={i === 0} />))
                  )}
                  {items.length === 0 && lane !== "active" && <p className="m-0 rounded-[12px] border border-dashed border-brand-field px-3 py-6 text-center text-[13px] text-brand-ink-2">Nothing here</p>}
                </LaneColumn>
              );
            })}
          </div>
        </div>
        <DragOverlay>{dragging ? <Card card={dragging} first={false} overlay /> : null}</DragOverlay>
      </DndContext>

      <Dialog open={Boolean(confirm)} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="w-[calc(100%-32px)] max-w-[420px] rounded-[16px] border-none font-brand">
          <DialogHeader>
            <DialogTitle className="text-[18px] font-normal">Send {confirm?.name}?</DialogTitle>
            <DialogDescription className="text-[15px] text-brand-ink-2">Klingit may come back with questions. Send anyway?</DialogDescription>
          </DialogHeader>
          {confirm?.quality != null && <p className="m-0 text-[13px] text-brand-mute">Brief quality {confirm.quality}</p>}
          <DialogFooter>
            <button type="button" onClick={() => setConfirm(null)} className="h-10 rounded-full border border-brand-outline px-[18px] font-brand-mono text-[12px]">
              Keep editing
            </button>
            <button
              type="button"
              onClick={() => {
                const c = confirm;
                setConfirm(null);
                if (c) send(c);
              }}
              className="h-10 rounded-full bg-brand-ink px-[18px] font-brand-mono text-[12px] text-white"
            >
              Send anyway
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LaneColumn({ lane, title, hint, count, blockedReason, accepting, children }: { lane: Lane; title: string; hint: string; count: number; blockedReason: string | null; accepting: boolean; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: `lane:${lane}` });
  return (
    <section
      ref={setNodeRef}
      aria-label={title}
      data-column={title}
      className={cn("relative flex min-h-[520px] min-w-0 flex-col gap-2.5 rounded-[14px] bg-brand-nav p-3 transition-shadow", accepting && "shadow-[inset_0_0_0_1.5px_var(--brand-ink)]", blockedReason && "cursor-not-allowed")}
    >
      <div className="flex flex-col gap-0.5 px-1 pb-0.5 pt-1">
        <div className="flex items-center">
          <h2 className="m-0 flex-1 text-[15px] font-semibold">{title}</h2>
          <span className="text-[13px] text-brand-ink-2">{count}</span>
        </div>
        <span className="text-[12px] text-brand-ink-2">{hint}</span>
      </div>
      {blockedReason && (
        <span role="tooltip" className="absolute left-1/2 top-12 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-brand-ink px-3 py-1.5 text-[12px] text-white shadow-md">
          {blockedReason}
        </span>
      )}
      {children}
    </section>
  );
}

function SlotMeter({ slots }: { slots: Slots }) {
  // Work that started before slots existed can run over the plan; the meter says so rather than hiding it.
  const over = slots.used > slots.total;
  const segments = Math.max(1, slots.total, slots.used);
  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] bg-white px-3 py-2.5" aria-label={over ? `${slots.used} active, plan has ${slots.total}` : `Active slots: ${slots.used} of ${slots.total} used`}>
      <div className="flex text-[12px]">
        <span className="flex-1">Active slots</span>
        <span>
          {slots.used} of {slots.total} used
        </span>
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${segments}, minmax(0, 1fr))` }}>
        {Array.from({ length: segments }, (_, i) => (
          <span key={i} className={cn("h-1.5 rounded-full", i < slots.used ? "bg-brand-ink" : "border border-dashed border-brand-mute")} />
        ))}
      </div>
    </div>
  );
}

type GripProps = { attributes?: Record<string, unknown>; listeners?: Record<string, unknown>; locked?: string };

function Card({ card, first, overlay, grip, style, innerRef, faded }: { card: BoardCard; first: boolean; overlay?: boolean; grip?: GripProps; style?: React.CSSProperties; innerRef?: (el: HTMLElement | null) => void; faded?: boolean }) {
  const locked = grip?.locked ?? (!canPickUp(card.lane) ? "Klingit moves projects along" : undefined);
  return (
    <article ref={innerRef} style={style} className={cn("relative flex flex-col gap-3 rounded-[12px] bg-white p-3.5 shadow-[0_1px_2px_rgba(30,30,30,0.05)]", overlay && "rotate-1 shadow-[0_8px_24px_rgba(30,30,30,0.18)]", faded && "opacity-40")}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-label={locked ? `${card.name}: ${locked}` : `Move ${card.name}`}
          aria-disabled={locked ? true : undefined}
          title={locked}
          className={cn("relative z-10 -ml-1 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[6px] text-brand-mute", locked ? "cursor-not-allowed" : "cursor-grab touch-none hover:bg-brand-chip hover:text-brand-ink active:cursor-grabbing")}
          {...(locked ? {} : grip?.attributes)}
          {...(locked ? {} : grip?.listeners)}
        >
          <GripVertical className="size-3.5" strokeWidth={1.75} />
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Link href={card.href} className="flex items-start gap-1.5 text-[15px] leading-[1.3] text-brand-ink no-underline after:absolute after:inset-0 after:rounded-[12px] after:content-[''] hover:underline">
            {card.confidential && <Lock aria-label="Confidential" className="mt-1 size-3.5 shrink-0 text-brand-ink-2" />}
            <span className="min-w-0">{card.name}</span>
          </Link>
          <span className="text-[12px] text-brand-ink-2">{card.meta}</span>
        </div>
        {card.queuePosition !== null && (
          <span aria-label={`Number ${card.queuePosition} in the queue`} className="flex h-6 min-w-6 items-center justify-center rounded-[6px] bg-brand-chip px-1.5 text-[12px]">
            {card.queuePosition}
          </span>
        )}
      </div>
      {card.quality !== null && (
        <div className="flex items-center gap-2 text-[12px] text-brand-ink-2">
          <span className="h-1 flex-1 rounded-full bg-brand-line">
            <span className="block h-full rounded-full bg-brand-ink" style={{ width: `${card.quality}%` }} />
          </span>
          Brief {card.quality}
        </div>
      )}
      <StatusDot tone={card.status.tone} wrap className="text-[13px] leading-[1.4]">{card.status.label}</StatusDot>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-brand-ink-2">{card.foot}</span>
        {card.team.length > 0 && <AvatarStack names={card.team} size={28} max={3} overlap={4} />}
      </div>
      {card.action && (
        <Link
          href={card.action.href}
          className={cn(
            "relative z-10 inline-flex h-[34px] items-center justify-center rounded-full font-brand-mono text-[11px] no-underline",
            // One action per card, never orange: black on the lane's first card (queued: always outlined), outlined after it.
            first && card.lane !== "queued" ? "bg-brand-ink text-white hover:bg-black" : "border border-brand-outline bg-white text-brand-ink hover:border-brand-ink"
          )}
        >
          {card.action.label}
        </Link>
      )}
    </article>
  );
}

function DraggableCard({ card, first }: { card: BoardCard; first: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
  return <Card card={card} first={first} innerRef={setNodeRef} grip={{ attributes: attributes as unknown as Record<string, unknown>, listeners: listeners as Record<string, unknown> }} faded={isDragging} />;
}

function SortableCard({ card, first }: { card: BoardCard; first: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  return (
    <Card
      card={card}
      first={first}
      innerRef={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      grip={{ attributes: attributes as unknown as Record<string, unknown>, listeners: listeners as Record<string, unknown> }}
      faded={isDragging}
    />
  );
}
