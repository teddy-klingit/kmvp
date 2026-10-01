import { AskMarketIntelligenceForm } from "@/components/portal/ask-market-intelligence-form";

type Question = { id: string; question: string; answer: string };

/** Fixed to the bottom of the viewport (not just the end of page content) so it's reachable without scrolling — offset via the --sidebar-width CSS variable the sidebar keeps in sync with its own collapsed state. */
export function AskAnythingSection({ questions }: { questions: Question[] }) {
  return (
    <div
      className="fixed bottom-0 right-0 z-30 border-t border-border bg-card/95 px-10 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.04)] backdrop-blur-sm"
      style={{ left: "var(--sidebar-width, 14rem)" }}
    >
      <div className="mx-auto max-w-6xl">
        <AskMarketIntelligenceForm recentQuestions={questions} />
      </div>
    </div>
  );
}
