/**
 * An agent build project (AgentProject.dc.html): a normal project with agentBuild = true, plus its spec, the
 * five build steps, the latest test output and the cost, kept on the brief (Brief.agentDrafts.agentBuild).
 */

export const BUILD_STEPS = ["Request", "Scoping", "Building", "Testing", "Live"] as const;
export type BuildStep = (typeof BUILD_STEPS)[number];

export type AgentBuildSpec = { whatItDoes: string; whatItUses: string; whatYouGet: string; runs: string };

export type AgentBuild = {
  /** The step it's on now. */
  step: BuildStep;
  /** When each step happened or is planned (ISO dates); missing = not planned yet. */
  dates: Partial<Record<BuildStep, string>>;
  spec: AgentBuildSpec;
  testOutput: { title: string; text: string; quality: number | null; at: string | null } | null;
  /** Build cost and the estimated credits per run. */
  buildCredits: number | null;
  perRunCredits: number | null;
};

export function agentBuildOf(brief: { agentDrafts: unknown } | null | undefined): AgentBuild | null {
  const drafts = brief?.agentDrafts;
  if (!drafts || typeof drafts !== "object") return null;
  const b = (drafts as { agentBuild?: AgentBuild }).agentBuild;
  return b && typeof b === "object" && b.spec ? b : null;
}

export const stepIndex = (step: BuildStep) => BUILD_STEPS.indexOf(step);
