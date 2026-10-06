/** Pure text helpers for the review (safe in the browser). */

/** Removed / added runs between two texts (common start and end kept, the middle swapped). */
export function textDiff(from: string, to: string): { type: "same" | "removed" | "added"; text: string }[] {
  let start = 0;
  while (start < from.length && start < to.length && from[start] === to[start]) start++;
  let end = 0;
  while (end < from.length - start && end < to.length - start && from[from.length - 1 - end] === to[to.length - 1 - end]) end++;
  // Snap to word edges so a change reads as whole words.
  while (start > 0 && start < from.length && /\S/.test(from[start - 1]) && /\S/.test(from[start])) start--;
  while (end > 0 && from.length - end - 1 >= 0 && /\S/.test(from[from.length - end - 1]) && /\S/.test(from[from.length - end])) end--;
  const out: { type: "same" | "removed" | "added"; text: string }[] = [];
  if (start) out.push({ type: "same", text: from.slice(0, start) });
  if (from.length - end > start) out.push({ type: "removed", text: from.slice(start, from.length - end) });
  if (to.length - end > start) out.push({ type: "added", text: to.slice(start, to.length - end) });
  if (end) out.push({ type: "same", text: from.slice(from.length - end) });
  return out;
}
