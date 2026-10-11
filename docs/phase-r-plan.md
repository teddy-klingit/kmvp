# Phase R plan: editable rules, Skills by goal, Plan (Calendar + Opportunities)

Spec: `screenshots/design-reference/phase-r/phase-r-part2-prompt.md`. Designs: `screenshots/design-reference/phase-r/01–07`.
Investigation done on 2026-10-12, before any code. Q2 stays as is (ad-account owners + AuditLog, `teamAllowance`,
encrypted own keys, ouhers at 14 of 40, relative demo dates).

## What exists today

- **Rules** are three JSON string lists on `BrandOS` (`toneRules`, `dos`, `donts`); the Rules tab only reads them.
  Every skill, the Brief assistant and the Brand OS vision check read them through `buildBrandContext()` /
  `vision-check.ts`, fresh from the database on each run (nothing cached). There is no copy-rule check, no
  history and no permissions beyond "any member can edit Platform".
- **Skills**: `Agent.kind` SKILL/ASSISTANT/INTERNAL and `skillCategory` (Copy/Visual/Social/Briefs). Seven
  self-service skills plus client custom skills. The run page is one free-text form with one result. Templates
  are their own tab (`Template` rows).
- **Calendar** shows project dates, `ContentPost` rows (the content plan, edited by staff), `ClientCalendarItem`
  (client's own: title, date, channel, notes; hard-deleted today) and pending `ContentPlanSuggestion` rows.
  Coverage compares posts with `ContentPlanTarget` (posts a week per platform, the agreement).
- **Ideas** live in three places: `MarketIntelligenceIdea` (Insights → Market → Ideas, with why/evidence/chart),
  `ContentPlanSuggestion` (calendar) and `Inspiration` (Projects → Inspiration).
- **Scheduler**: `agent-scheduler.ts` ticks hourly (demo accounts skipped). Brief Studio starts from a text
  (`startStudio`) and pre-fills from Brand OS.

## Steps (one commit and deploy each)

1. **R1 Rules.** `BrandRule` (type, text, words, scope, active, status ACTIVE/SUGGESTED/DRAFT, used/caught counts,
   soft delete) and `BrandRuleChange` (who, when, before/after, undo). Today's tone rules, do's and don'ts are
   copied into rules by the migration (the old fields stay, unread). One `checkCopy()` for the whole app:
   deterministic word/format checks plus the model for the rest; used by the test-copy card, skill results and the
   Brand OS check. `buildBrandContext` and the vision check read active rules. Admin edit, member suggest
   (orange row, Approve/Decline), staff edit "· Klingit", account lead notified. Word lists as chips. PDF import
   to drafts (the PDF goes to the model; drafts never active until approved).
2. **R2 Skills.** `Agent.availability` (self_service / klingit_run / custom), `Agent.goal` (make_ad / write_copy /
   plan_brief), `Agent.examples`, `Agent.teamCreditsEstimate`. Run-by-Klingit skills (Video cutdowns,
   Localisation, Performance deep-dive, Brand check) and a Carousel builder. All skills / Your custom skills;
   Templates tab gone (redirect), templates as "Start from" and as Layouts in Visual identity; "Make more like this"
   in the Output library. "What do you want to make?" router (assistant AI credits). New run page: chips, product
   from Brand OS, versions 1–4 side by side, each through `checkCopy`, Save / Edit / Redo, Ask Klingit to polish
   (a Draft on Ongoing projects).
3. **R3 Plan.** `/plan` replaces `/calendar` (redirect). Plan items get `maker` (client / klingit_help /
   klingit_project), status, channels, formats, end date, project, opportunity + route, soft delete.
   `PlanLeadTime` (working days per format, staff-editable) gives brief-by dates; `KeyMoment` (per market,
   staff-editable). 5-week view (default), month, list; campaign bars; key moments; gap warnings vs the agreement;
   drag to reschedule; reminders 7 and 2 days before brief-by (+ Home Needs you); Start brief pre-filled; iCal feed
   (`PlanFeedToken`, revocable). Add to plan dialog, idempotent.
4. **R4 Opportunities.** `Opportunity` (sources, evidence items, chart, window, brief-by, fits, status, reviewed by
   Klingit, hidden, dismiss reason) and `OpportunityRoute` (name, description, formats, channels, sample line +
   its rule check, cost range, status). Existing ideas, calendar suggestions and inspiration are copied over.
   Plan → Opportunities list and detail; Insights Ideas tab removed (redirect) and charts link to their
   opportunity; weekly job (Klingit's cost) + Ask for more (client's AI credits); `/ops` review; Home card.
5. **R5 Demo data** for ouhers, dated relative to the seed date: ~24 rules with a member suggestion and history,
   skills with labels/goals/examples, plan items as in 04, 5 opportunities with Singles Day complete as in 07.
6. **Screens + report**: before / after / design at 1440, appended to the Phase Q report.

## Kept different from the design (so far)

- Products come from Brand OS `keyProducts` (no separate product table); a product's claims are the Claims & legal
  rules scoped to it.
- Rule usage counts ("Used N× · caught M") count from `checkCopy` runs from now on; old runs weren't recorded.
