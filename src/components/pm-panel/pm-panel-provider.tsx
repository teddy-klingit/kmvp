"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PmPanel } from "@/components/pm-panel/pm-panel";

/**
 * Message your PM (Phase U): one provider per app (portal or ops) holds whether the right-hand panel is open, and for
 * which client (staff) and project. Every "Message" button opens it over the current page; ?message=1 (from a
 * notification) opens it on load.
 */
type Open = { clientId?: string; projectId?: string | null } | null;
const Ctx = createContext<{ open: (o?: { clientId?: string; projectId?: string | null }) => void; unread: number }>({ open: () => {}, unread: 0 });

export function PmPanelProvider({ side, unread = 0, defaultClientId, children }: { side: "client" | "staff"; unread?: number; defaultClientId?: string; children: React.ReactNode }) {
  const params = useSearchParams();
  // ?message=1 (from a notification) opens it on arrival.
  const [state, setState] = useState<Open>(() => (params?.get("message") === "1" && (side === "client" || defaultClientId) ? { clientId: defaultClientId, projectId: null } : null));
  const [seen, setSeen] = useState(Boolean(state));
  const open = useCallback((o: { clientId?: string; projectId?: string | null } = {}) => {
    setState({ clientId: o.clientId ?? defaultClientId, projectId: o.projectId ?? null });
    setSeen(true);
  }, [defaultClientId]);
  return (
    <Ctx.Provider value={{ open, unread: seen ? 0 : unread }}>
      {children}
      {state && <PmPanel side={side} clientId={state.clientId} projectId={state.projectId ?? null} onClose={() => setState(null)} />}
    </Ctx.Provider>
  );
}

export const usePmPanel = () => useContext(Ctx);

/** "Message": opens the panel; an unread dot while the other side has written since you last looked. */
export function MessagePmButton({ className, children, clientId, projectId, dot = true }: { className?: string; children: React.ReactNode; clientId?: string; projectId?: string | null; dot?: boolean }) {
  const { open, unread } = usePmPanel();
  return (
    <button type="button" onClick={() => open({ clientId, projectId })} className={className}>
      {children}
      {dot && unread > 0 && <span aria-label={`${unread} unread`} className="ml-1.5 inline-block size-2 rounded-full bg-brand-orange align-middle" />}
    </button>
  );
}
