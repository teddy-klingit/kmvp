import { Suspense } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { loadRulesPage } from "@/lib/brand-rules";
import { undoRuleChangeAction, wordAction } from "@/lib/actions/brand-rule-actions";
import { PageGrid } from "@/components/ds/page-grid";
import { WORK_TZ } from "@/lib/working-hours";
import { RulesEditor, type RuleMode } from "@/components/portal/rules/rules-editor";
import { ImportCard, TestCopyCard } from "@/components/portal/rules/rules-side";

const time = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, day: "numeric", month: "short" }).format(d);
function when(d: Date, now = new Date()) {
  const diff = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  return diff === 0 ? `Today ${time(d)}` : diff === 1 ? "Yesterday" : day(d);
}

/**
 * Brand OS → Rules (design 01), for a client (admins change, members suggest) and for Klingit staff in ops (mode
 * "staff", with the clientId on every form). Typography and colours stay in Visual identity: Rules holds rules.
 */
export async function RulesView({ clientId, mode, showAll = false }: { clientId: string; mode: RuleMode; showAll?: boolean }) {
  const data = await loadRulesPage(clientId);
  const canEdit = mode !== "member";
  const staffId = mode === "staff" ? clientId : undefined;
  const history = showAll ? data.changes : data.changes.slice(0, 4);

  return (
    <div className="flex flex-col gap-6">
      <p className="m-0 flex flex-wrap items-center gap-3 rounded-[12px] bg-white px-6 py-3.5 text-[14px]">
        <span aria-hidden className="size-2 rounded-full bg-[#8D9E47]" />
        <span className="flex-1">Rules feed every skill, assistant and quality check. Changes apply right away.</span>
        <span className="text-[12px] text-brand-ink-2">Members suggest, admins approve</span>
      </p>
      <PageGrid
        main={
          <>
            <Suspense>
              <RulesEditor rules={data.rules} mode={mode} clientId={staffId} lastChanged={data.lastChangedAt ? when(data.lastChangedAt).toUpperCase() : null} />
            </Suspense>
            <section aria-label="Word lists" className="overflow-hidden rounded-[12px] bg-white">
              <h2 className="m-0 border-b border-brand-line px-6 py-5 text-[18px] font-normal">Word lists</h2>
              <div className="grid grid-cols-1 gap-6 px-6 py-5 min-[700px]:grid-cols-2">
                <WordList title="Words to use" list="use" words={data.words.use} canEdit={canEdit} clientId={staffId} icon={<Check className="size-4 text-brand-lime-strong" />} />
                <WordList title="Words to avoid" list="avoid" words={data.words.avoid} canEdit={canEdit} clientId={staffId} icon={<AlertTriangle className="size-4 text-brand-orange" strokeWidth={1.75} />} />
              </div>
            </section>
          </>
        }
        side={
          <>
            <TestCopyCard clientId={staffId} />
            <section aria-label="Change history" className="overflow-hidden rounded-[12px] bg-white">
              <div className="flex items-center gap-3 border-b border-brand-line px-6 py-5">
                <h2 className="m-0 flex-1 text-[18px] font-normal">Change history</h2>
                {data.changes.length > 4 && !showAll && (
                  <a href="?history=all#history" className="font-brand-mono text-[12px] text-brand-ink underline underline-offset-4">
                    ALL
                  </a>
                )}
              </div>
              {history.length === 0 ? (
                <p className="m-0 px-6 py-5 text-[14px] text-brand-ink-2">No changes yet.</p>
              ) : (
                <ul id="history" className="m-0 list-none p-0">
                  {history.map((c) => (
                    <li key={c.id} className="flex gap-4 border-b border-brand-line px-6 py-3.5 text-[14px] leading-[1.45] last:border-b-0">
                      <span className="w-20 shrink-0 text-[13px] text-brand-mute">{when(c.at)}</span>
                      <span className={c.undone ? "flex-1 text-brand-mute line-through" : "flex-1"}>
                        <b className="font-semibold">
                          {c.who}
                          {c.byKlingit ? " · Klingit" : ""}
                        </b>{" "}
                        {c.summary}
                      </span>
                      {canEdit && c.canUndo && (
                        <form action={undoRuleChangeAction}>
                          <input type="hidden" name="changeId" value={c.id} />
                          {staffId && <input type="hidden" name="clientId" value={staffId} />}
                          <button type="submit" className="text-[13px] text-brand-ink underline underline-offset-2">
                            Undo
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {canEdit && <ImportCard clientId={staffId} />}
          </>
        }
      />
    </div>
  );
}

function WordList({ title, list, words, canEdit, clientId, icon }: { title: string; list: "use" | "avoid"; words: string[]; canEdit: boolean; clientId?: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="flex items-center gap-2 text-[14px] font-semibold">
        {icon}
        {title}
      </span>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {words.map((w) => (
          <li key={w} className="inline-flex h-9 items-center gap-1 rounded-full border border-brand-outline bg-white pl-3.5 pr-1.5 text-[14px]">
            {w}
            {canEdit ? (
              <form action={wordAction}>
                <input type="hidden" name="list" value={list} />
                <input type="hidden" name="word" value={w} />
                <input type="hidden" name="op" value="remove" />
                {clientId && <input type="hidden" name="clientId" value={clientId} />}
                <button type="submit" aria-label={`Remove “${w}”`} className="flex size-6 items-center justify-center rounded-full text-brand-ink-2 hover:bg-brand-chip">
                  <X className="size-3.5" />
                </button>
              </form>
            ) : (
              <span className="w-2" />
            )}
          </li>
        ))}
        {words.length === 0 && <li className="text-[14px] text-brand-ink-2">None yet.</li>}
      </ul>
      <form action={wordAction} className="flex items-center gap-2">
        <input type="hidden" name="list" value={list} />
        {clientId && <input type="hidden" name="clientId" value={clientId} />}
        <label className="sr-only" htmlFor={`add-word-${list}`}>
          Add a word to {title.toLowerCase()}
        </label>
        <input id={`add-word-${list}`} name="word" required placeholder={canEdit ? "+ Add word" : "+ Suggest a word"} className="h-9 w-40 rounded-full border border-brand-outline bg-white px-3.5 text-[14px] outline-none focus:border-brand-ink" />
        <button type="submit" className="text-[13px] text-brand-ink underline underline-offset-2">
          Add
        </button>
      </form>
    </div>
  );
}
