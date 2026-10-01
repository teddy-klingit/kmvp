# Klingit design system

The visual spec is `screenshots/design-reference/*.dc.html` (approved 2026-10-01). This doc maps those designs to code. **When the design and this doc disagree, the design wins.** Fix this doc to match.

Scope: the tokens apply across the app. The components in `src/components/ds/` are used on the redesigned screens (the client project page with its three tabs, and the conversation panel) and in both sidebars. Other screens still use `src/components/ui/` and get moved over as they're redesigned.

## Tokens

Defined in `src/app/globals.css` as `--ds-*` variables and exposed to Tailwind as `ds-*` colours (`bg-ds-card`, `text-ds-text-2`, `border-ds-border`, `shadow-ds`, …).

| Token | Value | Use |
|---|---|---|
| `ds-bg` | #F4F5F7 | Page background, sidebars, other people's chat bubbles |
| `ds-card` | #FFFFFF | Cards, conversation panel |
| `ds-border` | #E4E6EA | Card borders, tab rail, panel edge |
| `ds-divider` | #EEF0F2 | Hairlines inside a card (header rule, table rows, summary bar) |
| `ds-control-border` | #D5D8DD | Secondary buttons, inputs, chips, upcoming timeline dots |
| `ds-subtle` / `ds-subtle-2` | #F1F2F4 / #FAFAFB | Neutral pill and segmented-control track / table total row |
| `ds-nav-active` | #E9EBEE | Active nav item |
| `ds-text` | #15171A | Primary text, primary button, done timeline dots |
| `ds-text-2` | #5B616B | Secondary text, labels, inactive nav and tabs |
| `ds-text-3` | #6B7280 | Tertiary text: upcoming captions, placeholders |
| `ds-text-body` | #3F444C | Inclusion lists, neutral pill text |
| `ds-turn` / `-tint` / `-text` / `-strong` / `-border` | #E2561B / #FDEBDD / #8A3A0E / #B8460F / #F3C9AE | "Your turn": current timeline dot and halo, turn pills, the Next step card |
| `ds-success-tint` / `-text`, `ds-check` | #E3F0D2 / #2E5A1C, #3F7A2B | Approved pills, inclusion checks |
| `ds-changes-*` | #FBE3F1 / #8C1D5E | "Changes asked" |
| `ds-watch-*` | #FDF3D6 / #7A5A06 | Paused, out of scope |
| `ds-danger-*` | #FDE7E7 / #9B1C1C | Errors, overdue |
| `ds-info-*` | #EEF0FB / #2C3A8C | Informational |
| `shadow-ds` | 0 1px 2px rgba(16,24,40,.04) | Every card |

Radii: card 12, button and nav item 8, segmented track 8 (its buttons 6), pills and chips 999.

Type (Inter): 12 / 13 / 14 / 15 / 16 / 24, weights 400 / 500 / 600.
- Page title: 24/600, −0.015em.
- Card title: 15/600.
- Next step title: 16/600.
- Body: 14.
- Meta: 13.
- Labels and pills: 12/500.

### Where the design overrides the spacing scale

Our scale is 4 / 8 / 12 / 16 / 24 / 32 / 48. The designs also use these values, and the components follow the design:

| Value | Where |
|---|---|
| 18px | Card header vertical padding (`py-[18px]`) |
| 14px | Summary bar cell padding (`py-3.5`), table cell padding, asset card title padding |
| 20px | Gap between page sections (`gap-5`), Next step card padding, panel padding |
| 10px | Nav item vertical padding, tab padding, chat bubble padding |
| 3px / 2px | Pill padding |
| 11px | Avatar initials and unread badges. These are the only text under 12px, and they come from the design. |

### Tap targets (phones)

Below 640px, buttons, chips, segmented controls and tabs grow to 44px tall. From `sm` up they use the design heights (32 / 36 / 40).

## Components (`src/components/ds/`)

| Component | What it is |
|---|---|
| `Card`, `CardHeader`, `CardBody` | The only section container. `tone="turn"` gives the orange border used by the Next step card. `CardHeader` takes `title` (15/600), `meta` (pills next to the title) and `action` (pushed right), with a divider below. |
| `StatusPill` | Tones: neutral, turn, success, changes, watch, danger, info. `dot` adds the leading dot, which the header uses. There is one pill style; don't make others. |
| `Button` | Variants primary, secondary, ghost. Sizes sm (32), md (36), lg (40), icon. `asChild` for links. **One primary button per page.** |
| `Avatar`, `AvatarStack` | Initials on a deterministic palette colour (FNV-1a of the display name), never orange. Within a stack, no two avatars share a colour. `overlap` (default 6px) sets how far each one tucks under the last. |
| `SummaryBar` | The facts row in the header card. A flex row when the card is at least 640px wide, a 2×2 grid when narrower. This is a container query, so it reacts to the docked panel as well as the viewport. Pass only facts that have a value; never "—" or TBD. |
| `ProjectTimeline` | One continuous track. Done is a dark dot with a check; current is an orange ring with a halo and a "Now · …" caption; upcoming is a grey ring. On phones it renders vertically. Variant `internal` (8 stages, 20px dots) is for the PM cockpit. |
| `PageTabs` | Underline tabs (gap 24, active 600 with a 2px ink underline). |
| `NextStepCard` | The single "what happens now" card: eyebrow (YOUR TURN / KLINGIT IS ON IT / custom), title, description, actions. It holds the page's primary action. |
| `SegmentedControl` | Two-up track used for the panel's channels, with optional badges. |
| `EmptyState` | Icon, title and description for an empty section, inside a `Card`. |
| `ConversationProvider` / `useConversation` | Shared state for the panel: the active channel, a context chip, and an `open()` signal. |
| `AskButton` | "Ask a question". Opens the panel, optionally with a context chip. |
| `ConversationPanel` | The right-hand conversation panel; see below. |

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

- Project pages render full-bleed inside the portal's `<main>` (`PortalMain`). The content column is max 1040px, centred, with 20px gaps; the panel runs down the full height of the right edge.
- Every other portal page keeps the padded `max-w-6xl` layout with its page transition.
- Nav (portal and ops): 232px wide, 24px × 16px padding, items 10px × 12px with radius 8 and 18px icons (stroke 1.75). Active items use `ds-nav-active` with 500 weight. The user block sits at the bottom above a top border. The portal sidebar's collapse-to-rail behaviour is unchanged.
- Asset grids use container queries: 1 column, 2 from a 520px container, 3 from 880px. With the panel docked at 1440 the Work tab shows 2 columns; folded it shows 3, as in `ClientReview.dc.html`.

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

## Brand theme (client Dashboard only, for now)

The calm dashboard (`ClientHomeV2.dc.html`, target `dashboard-target-1440.png`) uses the Klingit website brand. It replaces `ClientHome.dc.html` and its tiles. It's a separate theme. Scope it with `className="theme-brand"`, which sets the cream background, ink text and Albert Sans. Today only `/dashboard` uses it: `PortalMain` wraps that page in it, and the portal sidebar switches to brand styling on that route.

| Token | Value | Use |
|---|---|---|
| `brand-page` | #F9F5EC | Page background, nav (warm cream, as in ClientHomeV2) |
| `brand-cream` | #F9F5EC | Text on the photo banner, the "New project" pill |
| `brand-ink` / `brand-ink-2` | #1E1E1E / #4F4F50 | Text, primary buttons, progress fill; secondary text |
| `brand-orange` | #FF5D02 | **Your action only:** the numbered "Do this next" markers and "Waiting on you" dots |
| `brand-lime-strong` | #8D9E47 | The market-insight square |
| `brand-line` / `brand-track` | #EFEBE2 | Card title rules and row dividers / progress track |
| `brand-chip` | #F7F5F0 | Date chips in Next 7 days |
| `brand-rule` | #E6E0D2 | Nav user-block rule |
| `brand-outline` | #C2C3C5 | Secondary (outlined) pill border |
| `brand-lime` / `brand-pink` / `brand-peach` / `brand-grey` | #E4F2B3 / #F8DCF9 / #FEECE5 / #F7F7F8 | Kept as tokens; not used on the calm dashboard |
| `font-brand` | Albert Sans 300/400/600 | Text (stand-in for the licensed PolySans) |
| `font-brand-mono` | Azeret Mono 400 | Eyebrows, counts, stage labels, button text |
| `rounded-pill` | 999px | Buttons and nav items |

Rules:
- A 12-column grid: main column 8, side column 4, 24px gap. It sits 16px in from the banner edges.
- Hero: a 220px photo banner (`public/brand/klingit-hero.webp`, dark top-to-bottom gradient) with the date, a 36px weight-300 greeting, the summary line and the cream "New project" pill. The grid overlaps the banner's bottom 64px (a 96px pull-up minus the 32px section gap).
- Every section is a white card (radius 12, no border) with the same title row: 18px weight 400, 20px 24px padding, a #EFEBE2 rule underneath, and an optional mono count or link on the right.
- One primary button style: the black pill (40px, mono 12px, arrow, fixed 132px in "Do this next"). Secondary is an outlined pill. No decorative tiles.
- Orange means "your action" and appears nowhere else. The ds avatar palette has no orange for this reason.
- Project names never wrap (ellipsis). AvatarStack uses `overlap={4}` here, with the 2px white ring.

Breakpoints on this screen (container queries):
- **`@container/dash` under 960px:** one column; the side cards follow the main ones.
- **`@container/col` under 600px:** "Do this next" puts the due date and button on a second line; project rows stack (name and avatars, status, then the stage bar).
- **Under 900px viewport:** the nav becomes a top bar. The 900px top-bar breakpoint applies to the whole portal.
