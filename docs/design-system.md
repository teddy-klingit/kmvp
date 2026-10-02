# Klingit design system

The visual spec is `screenshots/design-reference/` (README + `X.dc.html` with `X-target-1440.png`). This doc maps those designs to code. **When the design and this doc disagree, the design wins.** Fix this doc to match.

Since Phase J the **Klingit brand theme is the whole app**: one shell, one set of tokens, one component kit in `src/components/ds/`. The older `src/components/ui/` primitives (Card, Badge, Button) are restyled through the same tokens, so pages that haven't been rebuilt yet still look on-brand. New and rebuilt pages use `ds`.

## Tokens (`src/app/globals.css`)

Both older token sets (`--background`, `--card`, `--muted-foreground`… and `--ds-*`) now carry the brand values. The brand set is also exposed directly as Tailwind `brand-*` colours.

| Token | Value | Use |
|---|---|---|
| `brand-page` (= `background`, `ds-bg`) | #F9F5EC | Page and nav background (cream) |
| white (`card`, `ds-card`) | #FFFFFF | Cards: radius 12, no border, no shadow |
| `brand-line` (= `border`, `ds-divider`) | #EFEBE2 | Card title rule, row dividers, segmented-control track |
| `brand-track` | #EFEBE2 | Progress bar track |
| `brand-chip` (= `muted`, `ds-subtle`) | #F7F5F0 | Date chips, quiet boxes, muted cards (Connect accounts), row hover |
| `brand-rule` | #E6E0D2 | Nav user-block rule, Ask pill border |
| `brand-outline` (= `input`, `ds-control-border`) | #C2C3C5 | Outlined (secondary) pills, inputs |
| `brand-ink` / `brand-ink-2` | #1E1E1E / #4F4F50 | Text, primary pills, bars and progress fills / secondary text |
| `brand-orange` (= `ds-turn`) | #FF5D02 | **Your action only**: "Do this next" markers, "Waiting on you" dots, the Needs-you badge, today on the calendar |
| `brand-lime` / `brand-lime-strong` | #E4F2B3 / #8D9E47 | Agent takeaway markers, success pills / done dots, market-signal squares |
| `brand-pink` / `brand-peach` | #F8DCF9 / #FEECE5 | "Your plan" on the calendar / your-turn tint |
| `ds-danger-*` (= `danger`, `destructive`) | #FDECEA / #B42318 | Errors, overdue. Red, never orange. |
| `ds-watch-*` (= `warning`) | #FDF3D6 / #7A5A06 | Paused, at risk, AI estimate |

Charts (`src/lib/chart-theme.ts`): ink bars; series ink, olive #8D9E47, plum #9C5A9F, grey. Never orange.

**Type**: Albert Sans 300 / 400 / 600 (stand-in for the licensed PolySans) for text, base 15px / 1.45; Azeret Mono for eyebrows, buttons, counts, table headings and small labels. Both load app-wide in the root layout.
- Page title: 36px weight 300 (30px on phones), with a 12px mono eyebrow above.
- Card title: 18px weight 400.
- Row title: 15–17px. Body 14, meta 12–13, mono labels 11–12.
- Big numbers: 24px (stat rows) / 28px (tiles) at weight 300, tabular.

### Tap targets (phones)

Below 640px, buttons, chips, pills and nav rows grow to 44px tall. From `sm` up they use the design heights (32 / 36 / 40).

## Components (`src/components/ds/`)

| Component | What it is |
|---|---|
| `PageHeader` | Mono eyebrow, 36px/300 title, actions on the right, optional breadcrumb (`back`) and the page's one `SegmentedNav` (`tabs`). `shared/page-header.tsx` wraps it for older call sites. |
| `SegmentedControl` / `SegmentedNav` | **The only tab style.** Pills on a #EFEBE2 track, ink active pill, 36px (44 on phones). `SegmentedNav` is route-driven (most specific href wins; `active` overrides for query views) and scrolls sideways on phones with the active pill kept in view. `PageTabs` and `ui/NavTabs` render it. Never two tab bars on one page: a second level is `FilterChips`. |
| `FilterChips` | Link chips with optional counts: ink when active, outlined otherwise. |
| `Card`, `CardHeader`, `CardBody`, `SectionCard`, `CardRows`, `CardNote` | White card (radius 12, no border). `CardHeader`: 18px/400 title, 20px 24px padding, #EFEBE2 rule, `meta` beside the title, `action` on the right. `SectionCard` = card + header. `CardRows` = divided rows. `CardNote` = one quiet line when a section has nothing yet. `tone="muted"` (cream-grey) and `tone="turn"` (peach ring). |
| `Button`, `pillClass`, `PillLink`, `monoLink` | Pills with a mono label: black primary, outlined secondary, ghost. `pillClass` styles a form submit or plain link; `PillLink` is a link-as-button; `monoLink` is the underlined mono link for title rows ("ALL PROJECTS"). |
| `StatusDot`, `DotLegend` | A status in plain words with its dot: orange = waiting on you, ink = Klingit working, green = done, grey = paused. |
| `StatusPill` | Pill labels (tones neutral, turn, success, changes, watch, danger, info). |
| `NumberedRow` | Marker + title + one-line detail + optional meta + one action. `marker="you"` is the orange circle (your action); `marker="agent"` the lime square (agent takeaways). Meta and action move under the text on narrow cards. |
| `StatRows`, `StatTiles`, `HBars`, `Meter` | Numbers. **Pass only metrics with data**: never a "—" tile. `change` only when a real previous period exists. |
| `DataTable`, `HealthDot` | The ops list table (OpsClients.dc.html): mono 11px headings, rows with #EFEBE2 rules, the first cell links the row. Scrolls inside its card on phones. |
| `EmptyState` | Dashed card, one line, one action (`inline` inside a card). |
| `PageGrid`, `Page` | 12 columns, main 8 / side 4, 24px gap; one column under 1000px (side goes under main). The main column is `@container/col`. |
| `Avatar`, `AvatarStack` | Initials on a deterministic palette colour. No orange, and every colour keeps white initials readable (≥ 4.5:1). `overlap` defaults to 6px; the calm screens use 4px, with a 2px white ring. |
| `SummaryBar`, `ProjectTimeline`, `NextStepCard`, `ConversationPanel`, `AskButton` | Project page parts (Phase H/I), restyled through the tokens. |

Insights-only parts live in `src/components/portal/insights/`: `AskPill` (header Ask), `AgentButton` (Generate / Refresh as a pill), `ConnectCard` (the one place missing data sources are explained), `MarketChips`.

### Conversation panel modes

| Viewport | Behaviour |
|---|---|
| ≥1440 | Docked, 380px, open by default |
| 1280–1439 | Docked, folded to a 56px rail by default |
| 768–1279 | Rail; opening it shows an overlay |
| <768 | Floating "Chat" button and a bottom sheet |

Open or folded is remembered per user in `localStorage` (`klingit.conversation.<userId>`) and read through `useSyncExternalStore`, with an in-memory fallback when storage is blocked. "Ask a question" opens the panel until the next fold or close.

Messages:
- Grouped by author within 10 minutes.
- System events (`Comment.kind = SYSTEM`) are centred chips reading "body · date". They never count as unread.
- Context chips ("On Story 9:16") link back to the asset, estimate or brief they're about. The server checks that the asset or estimate line belongs to the project before storing a chip.

## Layout

- **Shell** (`shared/app-nav.tsx`, both apps): 240px cream nav with the real logo SVG, pill rows (ink active), 18px icons, a mono section label ("AGENCY" in ops), Notifications and the user block (Account) at the bottom. Under 900px it's a top bar with a menu sheet.
  - Client: Home, Projects, Brand OS, Insights, Calendar, Reports, Custom apps · Notifications, Account. Help is linked from Account.
  - Ops: Needs you (orange count), Projects, Team, Agents · Agency: Clients, Price list, Archive · Notifications, Account (Billing, Analytics and Settings are in Account).
  - "Switch view" (demo persona switcher) sits above Notifications.
- **Page padding**: 24px top on Home, 40px elsewhere; 40 right, 56 bottom, 16 left next to the nav; 16px gutters on phones. Content max 1120px. `PortalMain` does this for the client; `OpsPage` for ops.
- Project pages render full-bleed (they own their column and the docked panel).
- Responsive: one column under 1000px; top bar under 900px; no horizontal page scroll (tables and boards scroll inside their card).

## Gotcha

The base `* { border-color }` rule lives in `@layer base`. Unlayered, it beat every `border-<colour>` utility, which is why coloured borders across the app (accent rules, the Next step card) used to render grey.

## PM cockpit (Phase I)

Built from the same `ds` parts, following `PMHome.dc.html` and `PMCockpit.dc.html`.

| Piece | Where | Notes |
|---|---|---|
| PM home "Needs you" | `src/components/ops/home/needs-you-home.tsx` | Greeting, 4 tiles, the ranked exception list (`src/lib/ops-exceptions.ts`), and the "Running automatically" table. Each exception row has one primary button that deep-links into the cockpit. |
| `StepCard` | `src/components/ops/cockpit/step-card.tsx` | One step: a 32px status dot, a 15/600 title, who-did-it pills (`STEP_PILL`), a one-line summary, Why (the agent run) and Edit. In edit mode the card gets an ink border and a lifted shadow. |
| `EstimateEditor` | `src/components/ops/cockpit/estimate-editor.tsx` | Quantity and complexity per line, add from the price list or a custom line, remove, out-of-scope rows, a live total with old values struck through, and a required "Reason for the client" once the client has a version. |
| Brief, dates and upload forms | `src/components/ops/cockpit/cockpit-forms.tsx` | Each form shows its own result line and a footer: note, Cancel, primary. |
| Project feed | `ConversationPanel` | Three tabs: Client (PM replies, shown to the client under the staff name), Staff notes (`tone: "note"` → `ds-note` bubble) and Activity (agent runs, decisions and client messages as a timeline). |
| Internal timeline | `ProjectTimeline variant="internal"` | 8 stages from `internalTimeline()` in `src/lib/ops-cockpit.ts`. |

Extra tokens: `ds-note` / `ds-note-border` (staff notes, changed estimate rows), `ds-watch-border` (a changed complexity select), `ds-dashed` ("Add line" button), `ds-star` / `ds-star-stroke` (rating).

## Home (ClientHomeV2)

Rules:
- A 12-column grid: main column 8, side column 4, 24px gap. It sits 16px in from the banner edges.
- Hero: a 220px photo banner (`public/brand/klingit-hero.webp`, dark top-to-bottom gradient) with the date, a 36px weight-300 greeting, the summary line and the cream "New project" pill. The grid overlaps the banner's bottom 64px (a 96px pull-up minus the 32px section gap).
- Every section is a white card (radius 12, no border) with the same title row: 18px weight 400, 20px 24px padding, a #EFEBE2 rule underneath, and an optional mono count or link on the right.
- One primary button style: the black pill (40px, mono 12px, arrow, fixed 132px in "Do this next"). Secondary is an outlined pill. No decorative tiles.
- Orange means "your action" and appears nowhere else. The ds avatar palette has no orange for this reason.
- Project names never wrap (ellipsis). AvatarStack uses `overlap={4}` here, with the 2px white ring.

Breakpoints on this screen:
- **Under 1000px viewport:** one column; the side cards follow the main ones.
- **`@container/col` under 600px:** "Do this next" puts the due date and button on a second line; project rows stack (name and avatars, status, then the stage bar).
- **Under 900px viewport:** the nav becomes a top bar. The 900px top-bar breakpoint applies to the whole portal.

## Insights (Phase J)

`Insights.dc.html`. One header (eyebrow "UPDATED TODAY 09:00 · META CONNECTED", title, `AskPill`) and one `SegmentedNav`: Overview · Performance · Market · Audience · SEO & AI visibility. Market's views are `FilterChips` (Feed · Competitors · Trends · Ideas). Community and Website are one Audience page (`#community`, `#website`). Old URLs redirect (`next.config.ts`).

- Overview takeaways are written by the performance agent (`PerformanceBrief.takeaways`, max 3, each with one action: start a brief or open a view, `takeawayHref`). They are rewritten after a week, on the next visit, after the response (`scheduleTakeaways`; `INSIGHTS_AGENT_ON_PAGE_LOAD=0` freezes it for screenshots).
- Data loaders in `src/lib/insights-data.ts` are cached per request, so the header and the tab share one read of each ad account.
- No "—" tiles anywhere; `insightSources()` decides which sources are missing because a metric is hidden.

## Phase J pages

| Page | Built from | Computed / real data |
|---|---|---|
| Projects | Projects.dc.html | 5 client-timeline columns (`CLIENT_COLUMNS`, `clientColumnFor`), status words from `statusLine()`, rows shared with Home (`ProjectRows`) |
| Calendar | Calendar.dc.html | `src/lib/calendar-items.ts` (Klingit / plan / suggested); suggestions carry `proposedDate` + `reason`; coverage = planned + published posts vs plan targets × 4 |
| Reports | Reports.dc.html | `GeneratedReport` per closed week/month (`src/lib/report-data.ts`, performance agent); send schedule on `ClientReportingConfig` |
| Brand OS | BrandIQ / BrandSection.dc.html | Health from `platformStatus()` (`src/lib/brand-completeness.ts`), readers from `SECTION_READERS`; drafts in `BrandSectionDraft`, saved only by the client |
| Account | Account.dc.html | Credits from the ledger (`creditSummary`), team from `ClientUser`; no card on file is shown (none stored) |
| Ops lists | OpsClients.dc.html | `DataTable` + `FilterChips`; client health from `src/lib/client-health.ts` (under 75 = at risk) |
