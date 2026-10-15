/** A client's pill colour on staff lists (Today, Plan): stable per client, from a small soft palette. */
const PALETTE = ["bg-[#F6DCEB] text-[#7A2E5C]", "bg-[#F9E3D5] text-[#8A4420]", "bg-[#E3E8F6] text-[#2E3F7A]", "bg-[#E2EFD9] text-[#3E5A22]", "bg-[#EFE6D6] text-[#5E4A22]"];

export function clientPill(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
