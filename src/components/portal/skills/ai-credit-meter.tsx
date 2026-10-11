/** AI credits as a meter: used in purple (#B455B6), the rest as the track. Optionally a forecast in light purple. */
export function AiCreditMeter({ used, allowance, forecast }: { used: number; allowance: number; forecast?: number }) {
  const pct = (v: number) => `${allowance > 0 ? Math.min(100, Math.max(0, (v / allowance) * 100)) : 0}%`;
  return (
    <span role="img" aria-label={`${Math.round(used)} of ${allowance} AI credits used`} className="relative block h-2 overflow-hidden rounded-full bg-brand-line">
      {forecast !== undefined && <span className="absolute inset-y-0 left-0 bg-[#E7C9E8]" style={{ width: pct(forecast) }} />}
      <span className="absolute inset-y-0 left-0 rounded-full bg-[#B455B6]" style={{ width: pct(used) }} />
    </span>
  );
}
