import Link from "next/link";
import { cn } from "@/lib/utils";

export type Column = {
  key: string;
  label: string;
  align?: "left" | "right";
  /** Extra classes for this column's cells (e.g. a width). */
  className?: string;
};

export type Row = { id: string; cells: Record<string, React.ReactNode>; href?: string };

/**
 * The ops list table (OpsClients.dc.html): mono 11px headings, 14px rows, #EFEBE2 rules. It sits inside a
 * Card under its title row. On narrow screens it scrolls inside the card, never the page. When a row has
 * an href, its first cell becomes the link (one tab stop per row) and the whole row is clickable.
 */
export function DataTable({ columns, rows, label, empty }: { columns: Column[]; rows: Row[]; label: string; empty?: React.ReactNode }) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className="overflow-x-auto">
      <table aria-label={label} className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn("whitespace-nowrap px-6 py-3 text-[12px] font-normal text-brand-mute", c.align === "right" ? "text-right" : "text-left", c.className)}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={cn("border-t border-brand-line", r.href && "relative hover:bg-brand-chip")}>
              {columns.map((c, i) => (
                <td key={c.key} className={cn("px-6 py-4 align-middle", c.align === "right" ? "text-right tabular-nums" : "text-left", c.className)}>
                  {i === 0 && r.href ? (
                    <Link href={r.href} className="text-brand-ink no-underline after:absolute after:inset-0 after:content-['']">
                      {r.cells[c.key]}
                    </Link>
                  ) : (
                    r.cells[c.key]
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A coloured dot plus a number, for health columns. Green from 75, orange (needs you) below. */
export function HealthDot({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-2 tabular-nums">
      <span aria-hidden className={cn("size-2 rounded-full", score >= 75 ? "bg-brand-lime-strong" : "bg-brand-orange")} />
      {score}
    </span>
  );
}
