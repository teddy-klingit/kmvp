# Phase J plan: Klingit brand design across the whole app

Status: **done** (approved 2026-10-02 with all defaults; shipped in 6 deploys: J1, J2 ×3, J3, J4). Spec: `screenshots/design-reference/` (README + 9 designs, 8 targets). Where the prompt and a design disagree, the design wins. Real data only: no placeholders, no "—" tiles, no invented trends, no stored scores.

Scope today: 54 client pages, 30 ops pages. Shipped in four stages, each pushed and confirmed by deployment ID.

## 0. Where things stand

- **Insights redesign, half built and local only (nothing pushed).** Done so far:
  - pill SegmentedControl / SegmentedNav, which project tabs, Account, Brand health, ops NavTabs and the Calendar toggle already render;
  - brand theme on `/insights`;
  - routes moved to `/insights/{performance,market,audience,seo}`, with redirects from every old URL;
  - the performance agent now writes up to 3 takeaways (new `PerformanceBrief.takeaways` column, scheduled on page load);
  - a shared Insights data layer, the header with the Ask pill, and the Connect accounts card.

  The pages themselves aren't rewritten yet, so the working tree doesn't build right now. This finishes in stage J2.
- Home (ClientHomeV2) is live and only needs the new shared components and the 1000px breakpoint.

## 1. Stage J1: theme, components, nav (do first)

**Theme, app-wide** (`src/app/globals.css`, root layout):
- Remap both old token sets to brand values at `:root`, so every page turns brand in one switch:
  - the legacy set: `--background`, `--card`, `--muted-foreground`, `--primary`…;
  - the ds set: `--ds-*`.
- Page #F9F5EC; cards white, radius 12, no border, no shadow; dividers #EFEBE2; ink #1E1E1E; secondary #4F4F50.
- Orange #FF5D02 only for "your action". The legacy `--warning` / `--danger` / `--destructive` are orange today; they become a red (#B42318 text on #FDECEA) and an amber, so orange stays meaningful.
- Lime #E4F2B3, with #8D9E47 for dots; pink #F8DCF9; peach #FEECE5.
- Albert Sans 300/400/600 as the body font everywhere; Azeret Mono for eyebrows, buttons and small labels.
- `isBrandRoute()` goes away: the brand shell is the only shell.

**Shared components in `src/components/ds/`** (new, or updated to the theme):

| Component | Notes |
|---|---|
| `PageHeader` | Mono eyebrow + 36px/300 title + actions on the right + an optional SegmentedNav underneath. Replaces `shared/page-header.tsx` everywhere (no search box or "+" button). |
| `SegmentedControl` / `SegmentedNav` | Done (pill). |
| `FilterChips` | Link-driven, with counts. |
| `Card` + `CardHeader` | One title-row style (18px/400, 20px 24px, #EFEBE2 rule, right aside), plus `CardBody` and `CardRows`. |
| `StatusDot` | Orange = waiting on you, ink = Klingit working, green #8D9E47 = done, grey = paused. Plain words beside it. |
| `AvatarStack` | 4px overlap, 2px white ring, no orange in the palette, a contrast check so initials are readable. |
| `EmptyState` | Dashed card, one line, one action. |
| `DataTable` | Mono uppercase headings, row links, status pills, health dots (OpsClients). |
| `NumberedRow` | Orange circle (your action) or lime square (agent takeaway), title, detail, one action. |
| `Button` / `PillLink` | Black pill primary, outlined secondary, 40px (44px on phones). |
| `StatRows`, `HBars`, `StatTiles`, `ConnectCard`, `PageGrid` | 12 columns, main 8 / side 4. |

The `ui/*` primitives (Card, Badge, Button, Table, Input) are restyled through the tokens so pages not rebuilt yet still look on-brand.

**Nav** (`components/portal/sidebar.tsx`, `components/ops/sidebar.tsx`, one shared `NavItem`):
- Client: Home, Projects, Brand IQ, Insights, Calendar, Reports, Custom apps, then at the bottom Notifications and Account (the user block), with the real logo SVG and pill active state.
- Ops: Needs you (count badge), Projects, Team, Agents, then under "AGENCY": Clients, Price list, Archive. At the bottom: Notifications and the user block.
- Under 900px the nav becomes a top bar with a menu sheet (exists for the client; add it for ops).

**Responsive rules:**
- Under 1000px: one column, with the side column under the main one. This is a viewport rule; Home moves from its 960px container rule to it.
- Under 900px: top bar.
- No horizontal page scroll, and tap targets ≥ 44px.

## 2. Stage J2: client pages

| Page | Build | Files |
|---|---|---|
| **Insights** | Finish per its README section. Overview (takeaways, CTR by format, best/weakest creative via `assetTitle()`, last 30 days, Connect accounts, market signals). Performance / Market (Feed · Competitors · Trends · Ideas as chips) / Audience (Community + Website merged) / SEO, restyled with the same cards, keeping their data and actions. | `insights/**`, `lib/insights-data.ts`, `lib/insights-brief.ts` |
| **Projects** | Header (eyebrow "N PROJECTS · N WAITING ON YOU", "+ New project"); Board/List control; chips All / Waiting on you · N / Klingit working · N / Delivered. Five columns from `MILESTONES` (Brief, Estimate, Production, Review incl. sign-off, Delivered). Cards: name, type, StatusDot line, mono due date, AvatarStack; dashed "Nothing here" for an empty column. List view uses the dashboard's "Your projects" rows (shared component). Keeps the card menu (duplicate / pause / delete), confidential lock, drafts, `?q=` search and "click goes to your next step". | `projects/page.tsx`, new `components/ds/project-row.tsx` + `project-board-card.tsx`, `lib/project-state.ts` (5-column helper) |
| **Calendar** | Month (default) / List; chips All / Klingit work / Your plan / Suggestions. Month grid in a card: today in an orange circle; pills are ink (Klingit: due, first draft, delivered), pink (your plan) or dashed lime (agent suggestions); legend in the footer. Side column: "Suggested by the agent" (each with Add) and "Plan coverage" vs the SOW minimum. List = the same items as dated rows. Header: "Add to plan", "Suggest content". | `calendar/page.tsx`, `calendar-month-view.tsx`, new `lib/calendar-items.ts`, migration (see decisions) |
| **Reports** | Weekly / Monthly / Custom; header "Build custom report" + "Send to…". Latest report: 3 numbered takeaways + top posts. Side column: past reports, send schedule. Today's weekly and monthly SOW sections move into "Open full report" and Monthly; the custom builder keeps every feature in the new cards. | `reports/layout.tsx` (new), `reports/page.tsx`, `reports/monthly/page.tsx` (new), `reports/custom/page.tsx`, new `lib/report-data.ts`, migration |
| **Brand IQ** | One SegmentedNav replaces the left sub-menu: Overview · Platform · Visual identity · Sources · Library · Agents. Overview: brand card, dark "Draft with AI from your sources" card while sections are empty, platform list with done / not-written dots. Side column: sources, Brand health **computed** from completeness. Section pages per BrandSection: breadcrumb, standard textarea with soft focus, Save / Cancel / Rewrite with AI, source chips with "+ Add source", side list and "Used by N agents". Services & products shows "Not written yet". Library uses `assetTitle()` (fixed once in `AssetTile`). | `assets/layout.tsx`, `assets/page.tsx`, `brand-platform/**`, `library`, `agents-templates/**`, new `lib/brand-completeness.ts`, new `lib/ai/agents/brand-draft-agent.ts`, redirects, migration |
| **Account** | Overview / Usage / Billing / Team / Security; eyebrow "KLARNA · SCALE PLAN". Plan card with the credits bar; team with permission pills and "+ Invite". Billing and security as side cards. Sub-tabs keep their data (usage chart and ledger, invoices, invite / remove, 2FA, notification prefs, Slack) in the new cards. | `account/**`, `two-factor-card.tsx`, `invite-teammate-form.tsx` |
| **Notifications, Help, Custom apps, Search** | PageHeader, cards and EmptyState from the same parts. | their pages |

## 3. Stage J3: screens built earlier

- **Client project page**: Overview, Work and Brief & scope, plus the conversation panel. Same layout and behaviour, new tokens, fonts and pill buttons; tabs are already a SegmentedNav.
- **PM screens**: Needs you and the cockpit, restyled the same way.

## 4. Stage J4: ops pages

- **OpsClients pattern** (header, chips, one card with a DataTable) for Clients, Price list, Archive, Team capacity, the Agents decision log and the Inbox.
- **Clients health is computed**, not the stored `Client.healthScore`: overdue projects, open waiting-on-client exceptions, flagged or failed agent runs, low credits and an upcoming renewal. "At risk" means health under 75.
- **Team** gets Capacity / Forecast as a SegmentedNav; the forecast chart sits in a Card, and the page is no longer orphaned.
- **Agents** gets Library / Decision log as a SegmentedNav.
- **The Klarna workspace's two overlapping tab sets** (the workspace layout's six, plus the five on the admin, brand-os, custom-apps and content-plan pages) become one SegmentedNav. Those four pages move into `(workspace)`, with redirects.

## 5. Process (every stage)

- Screenshots of every page at 1440 and 390, compared side by side with the target PNG where one exists, at least 2 rounds.
- Before/after pairs in `screenshots/index.html`, plus a "couldn't match, and why" list.
- `npm test` passes, with new tests for anything computed (brand health, client health, board columns, calendar items, report week), the "no — tiles" rule and the redirects.
- Push and confirm the deploy by its ID.

## 6. Decisions needed (my recommendation first)

1. **Nav label: "Brand IQ" or "Brand OS".** You asked for "Brand OS" earlier; Phase J and the designs say **Brand IQ**. → Use Brand IQ.
2. **Client nav: Help and Switch view aren't in the list.** → Switch view stays for demo users as a small row above the user block; Help moves into the Account menu (a link in its footer).
3. **Ops nav drops Inbox, Billing, Analytics and Settings.** → Inbox becomes a "Needs you" filter chip (same items, one list); Billing, Analytics and Settings move into the ops user menu. Add an `/ops/notifications` page.
4. **Calendar suggestions have no date.** Today the page invents one (+3 days each). → Add `proposedDate` and a short `reason` to `ContentPlanSuggestion`, written by the agent. Old suggestions without a date appear only in the side card, never on the grid. **Add** = the existing approve action, but on the proposed date.
5. **"SOW minimum".** There's no SOW model. → Use `ContentPlanTarget` (weekly × 4), which is what the seeded SOW volume already lives in. "Planned this month" counts PLANNED + PUBLISHED posts in the viewed month.
6. **Calendar's analytics** (KPI tiles, follower growth, outcomes) don't fit the new List view. → Move them to Insights → Audience / Performance.
7. **Reports have no stored reports.** → New `GeneratedReport` table (kind, period, takeaways, top post ids, generatedAt), written by the performance agent once a period closes (same after-page-load pattern). Past reports come from it plus `SavedReport`; the week label is computed.
8. **Send schedule.** → Add day, time and recipients to `ClientReportingConfig`, with a small "Change schedule" dialog. Today it's hard-coded text.
9. **Post thumbnails.** `ContentPost` has no image; we show picsum placeholders today. → Drop the placeholders and use a platform tile instead. Real thumbnails come when posts are synced.
10. **Account: "Visa •••• 4242" is hard-coded.** → Remove it (no payment-method data). Billing shows the last invoice only. "Upgrade plan" becomes "Ask about upgrading", which opens the account-lead chat.
11. **Account Overview tiles** (stored brand %, stored health score). → Drop them (stored scores), and with them the decorative tiles.
12. **Stored Brand OS percentages** (the seeded 94% and its component percentages). → Stop reading and seeding them. Keep the columns (no data deletion, per the never-hard-delete rule) and mark them deprecated.
13. **"Draft with AI" needs a new brand agent.** → New `brand_draft` agent that grounds itself in the client's summary, website (web search) and source titles. It has no file contents, since there are no real integrations yet, so drafts will say what they're based on. Drafts go in a `BrandSectionDraft` table and nothing is written to Brand OS until the client accepts each one.
14. **"Used by N agents".** Today only "Our brand" and "Target audience" are actually read by agents. → Extend `buildBrandContext` to include vision, mission, values, USPs, positioning and services, then derive the count from one `BRAND_CONTEXT_FIELDS` map. That makes it true, not decorative.
15. **Projects: Paused, Archived, Inspiration.** → Paused stays in its stage column with a grey "Paused" dot. Archived projects aren't on the board; an "Archived" chip appears only when there are some. Inspiration becomes a header action (no second tab level).
16. **Ops client health replaces the stored score.** → Computed from the factors in stage J4. The stored column stays but is no longer read.

## 7. Data we don't have (shown honestly, not faked)

- Real ad, social and analytics connections beyond Meta: those metrics are hidden, with one Connect accounts card.
- Post thumbnails, card on file, sessions or devices, a plan price: not shown.
- Brand-source file contents: agents see titles and links only, and say so.
