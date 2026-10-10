# Phase Q plan: Navigation v3, Skills, Output library, AI credits, Usage

Investigation done on 2026-10-11, before any code. The design references are copied to `screenshots/design-reference/nav-v3/` (01–09). `screenshots/` is gitignored, so they sit in the repo folder but are not committed.

## 1. What exists today

### Navigation
- **Nav files:** `src/components/portal/sidebar.tsx` holds the item list, `src/components/shared/app-nav.tsx` the shell (also used by ops).
  - Items: Home, Projects, Brand OS (`/assets`), Insights, Calendar, Reports, Custom apps (`/apps`).
  - Bottom: Switch view, Notifications, Account, and a profile row that links to `/account`.
  - A 72px rail and the mobile sheet already work.
- **Active highlight** is computed from the pathname only (`app-nav.tsx:41-46`). An ad opened from Insights lives at `/assets/library/[id]?from=insights`, so it matches `/assets` and Brand OS lights up. The page also renders inside the Brand OS layout.
- **Account** (`/account`) has its own tabs: Overview, Usage, Billing, Team, Security. Security holds notification preferences.
  - Reports is `/reports` (Weekly, Monthly, Custom).
  - There is no `isClientAdmin` helper; admin means `ClientUser.permission === "OWNER"`.
- **Notifications:** nothing ever marks one as read, so the unread dot never clears.

### "Agent" today
- **One `Agent` table holds three kinds of thing** (there is no kind or clientId field):
  - **Client-runnable:** 7 `selfService` agents.
  - **Built-in helpers:** brief, market intel / Ask anything, performance, SEO, content plan, brand draft, QC.
  - **Internal production automation:** estimate, staffing, feedback, autopilot.
- **Custom builds** are Projects with `agentBuild=true`, with the spec stored in `Brief.agentDrafts.agentBuild`. The ouhers demo's custom agents are global `Agent` rows (`demo_ouhers_*`).
- **"Agent" in client copy:** about 60 strings across Brand OS, Insights, Calendar, Brief studio, Help, onboarding and search. About 30 more on the staff side.
- **Client exposure of internal agents:**
  - "Your agents" lists internal agents that ran for the client.
  - `/assets/agents-templates/agent/[id]` opens any agent with no client check.
  - Search lists agent runs.

### Credits and LLM calls
- **Team credits** (1 credit = 1 hour): `Client.monthlyCreditAllowance`, `CreditLedgerEntry` (has `projectId`, no user), "held" = SENT estimates.
  - **Gap:** approving an estimate never writes a consumption entry, so "used" is 0 for real clients.
- **"6 of 3 used":** `slotUsage` (`src/lib/active-slots.ts:33`) counts every activated project that isn't DRAFT, DELIVERED or ARCHIVED. That includes In review, In feedback and Paused, plus confidential projects and projects activated by the migration backfill.
- **Plans:** `Plan { tier, activeSlots }` with `PlanTier` = STARTER, GROWTH, SCALE, ENTERPRISE (no Basic).
  - Allowances are hard-coded (16 / 40 / 80 / 160).
  - There is no subscription period, payment provider or bundle.
- **LLM calls:** one Anthropic entry point (`runAgentTask`, `src/lib/ai/run-agent.ts:56`), plus OpenAI images and Perplexity.
  - **Token usage is thrown away**, so nothing can be billed from real tokens yet.
  - **Client-triggered:**
    - self-service agents (→ skills)
    - Brief studio (→ Brief assistant)
    - Ask anything / Market ideas refresh (→ Ask your data / Market ideas)
    - takeaways and reports (→ Performance insights)
    - SEO audit, Brand OS draft, content-plan suggestions
  - **Klingit production:** estimate, feedback, QC vision check, the hourly scheduler, autopilot.

### Cross-client data leak (highest priority)
- **Where:** `askMarketIntelligenceQuestionAction` (`src/lib/actions/market-intelligence-actions.ts:73-75`) calls `getMetaAdAccountInsights()`, `getLinkedInAdInsights()` and `getGoogleAdsAccountInsights()` with no client.
- **Why it leaks:** these read one platform-wide ad account (env vars plus `IntegrationConnection`, which has no `clientId`). Every client, demo ones included, gets those campaigns in their answer.
- **Same pattern elsewhere:** `loadPaidMedia` and `syncDailyAdMetrics` copy the same global account's campaigns and daily rows into every real client with paid media in scope. That covers Klarna, Nordlys and Northvolt locally. The scheduler, takeaways and reports then read those copied rows.

### Delivered work, Calendar, video
- **Delivered work:** assets live in `Asset` (`performanceCtr` is the only number). Ad metrics live in `AdDailyMetric` at campaign level, with no link to assets.
  - Self-service outputs live only in `AgentRun.output` JSON (images as base64). Nothing reaches the Library.
- **Calendar "Add":** `approveContentPlanSuggestionAction` has no status guard and no pending state. It makes a several-second LLM call before marking the suggestion approved, so every extra click creates another draft, post and target bump. That explains the three "Refill pouch teaser" drafts.
- **Brand film:** the files are on the prod volume and are valid MP4s. The player is the problem:
  - Clicking the picture always pauses and opens a comment; there are no native controls.
  - `playing` goes out of sync when play() fails or when you switch 9:16 ↔ 1:1, so it can take two clicks.
  - A failed play() shows nothing.
  - The file route reads the whole file into memory for every Range request (fine for 3.5 MB, a risk at 250 MB).

## 2. Data model (migrations, all additive)

| Change | Why |
|---|---|
| `PlanTier` += `BASIC` | Basic plan (own model) |
| `Plan` += `name`, `monthlyAiCredits`, `monthlyTeamCredits`, `priceAmount?`, `currency`, `ownModel`, `sortOrder` | Plans are editable in staff admin. All values are placeholders. |
| `ClientPlan` (clientId, tier, periodStart, periodEnd) | Monthly reset and plan history |
| `AiCreditLedger` (clientId, userId?, amount, kind ALLOWANCE/BUNDLE/USAGE/ADJUSTMENT, sourceType skill/assistant, sourceId, sourceName, projectId?, format?, tokensIn, tokensOut, model, billedTo klingit/client_provider, agentRunId?, note, createdAt) | All AI-credit numbers come from here |
| `AiCreditBundle` (size, priceAmount?, currency, active) | Top-ups. 250 / 1,000 / 2,500, price shown as "€ —" PLACEHOLDER |
| `AiTopUpRequest` (clientId, bundleId, requestedBy, status PENDING/CONFIRMED/REJECTED, confirmedBy?) | "Buy bundle" with no real payment; staff confirm it |
| `CreditLedgerEntry` += `userId?`, `format?` | Team credits by person and by format |
| `Agent` += `kind` (SKILL / ASSISTANT / INTERNAL), `clientId?`, `skillCategory?`, `aiCreditsPerRun?`, `summary?` | Splits the table. Custom skills belong to one client. |
| `AgentRun` += `tokensIn`, `tokensOut`, `model`, `aiCredits` | Usage is logged from real token counts |
| `SkillOutput` (clientId, agentRunId, agentId, title, format?, channel?, text?, storageKey?, mimeType?, createdAt) | Skill runs save to the Output library. Asset requires a project, so outputs get their own table. |
| `Asset` += `performanceViews?` | A second library metric (views) next to CTR |
| `IntegrationConnection` += `clientId?` (see decision 2) | Ties live ad accounts to the one client they belong to |
| `BrandConnection` status gets "NEEDS_RECONNECT" (string, no migration) and `meta Json?` | Connections page rows |

- **Renames:**
  - Prisma models stay `Agent` and `AgentRun`. They are referenced in 60+ files plus the audit log, and the spec allows keeping internal names.
  - The client side reads `kind`.
  - Routes, components and copy are renamed.
  - `@@map` isn't needed because the table names don't change.
- **Tokens → AI credits:** `src/lib/ai-credits.ts` holds one constant, 1 AI credit = 1,000 weighted tokens (PLACEHOLDER). The weight is model price relative to the default model, and the file documents it. Web-search calls add a fixed placeholder weight.

## 3. Routes and redirects

| New | Old (redirects to the new) |
|---|---|
| `/dashboard` (Home, unchanged URL) | — |
| `/skills`, `/skills/yours`, `/skills/templates`, `/skills/[skillId]` (run), `/skills/build/[projectId]` (build page) | `/assets/agents-templates*`, `/assets/templates*`, agent build at `/projects/[id]` when `agentBuild` |
| `/projects` = Ongoing projects | — |
| `/library`, `/library/[assetId]` | `/assets/library*`, `/assets/top-performers`, `/assets/by-campaign` |
| `/assets` (Brand OS: Overview · Platform · Visual identity · Rules), `/assets/rules` | `/assets/agents-templates/brand-os` → `/assets/rules` |
| `/settings/account` (and team), `/settings/notifications`, `/settings/connections`, `/settings/apps`, `/settings/reporting` (Weekly · Monthly · Custom), `/settings/usage` (admins) or My usage (members) | `/account*`, `/apps`, `/reports*`, `/assets/sources*` |

Nav highlighting will use a route → section map that also handles moved pages.

## 4. Build order (each step is a separate commit, deploy and screenshot check)

0. **Data leak fix plus a test** (client A can never get client B's campaigns). This goes first, on its own.
1. **Migrations, ledger and credit engine.**
   - Capture tokens in `runAgentTask`.
   - Classify every call: skill / assistant charges the client; internal never does.
   - Allowance, bundle and over-allowance rules; Basic-plan logging without deduction.
   - 80% and 100% admin notifications.
   - Staff admin for plans, bundles, client plan, adjustments and top-up confirmation.
2. **Nav v3:** profile menu, settings shell and tab bar, redirects, highlight fix, Home badge, notifications marked read.
3. **Skills:** Run / Your skills / Templates, cost shown before a run and logged after, build page renamed, Klingit recommends. Rename all client and staff copy.
4. **Brand OS:** 4 tabs, Rules, a "learned from" line, one shared Brand health function.
5. **Ongoing projects:** 4 columns, slots bar (Active only), Needs you / Finished / Archived, and the Calendar Add fix.
6. **Output library:** filters, sort, performance badges by quartile within format (no data → no badge), multi-select download, skill outputs.
7. **Usage and My usage** (server-enforced), plus **Connections.**
8. **Home** in the new structure.
9. **ouhers seed** for every screen, the video player fix, screenshots in `screenshots/phase-q/` with a side-by-side comparison, and the report.

## 5. Placeholders (dashed PLACEHOLDER label)

- Plan prices and team credits per plan
- AI allowances (500 / 1,500 / 3,000)
- Bundle sizes and prices
- AI credits per run for each skill
- The tokens → credits rate
- "Add a slot" and "Change plan", which open a request dialog with no billing
