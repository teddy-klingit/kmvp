# ouhers: demo client account (seed pack)

A complete, fictional client account for demoing every part of Klingit 2.0. Everything here is demo data: the brand, the people, the competitors ("(demo)" in their names), the publications, and all numbers. Ouhers is not a real company. Its domain is `ouhers.demo`.

"Today" in the data is **2026-10-06**. The client has been with Klingit since March 2026.

## What's in the folder

| Folder | Contents |
|---|---|
| `brand/logo/` | Wordmark and "oh." monogram as outlined SVG + PNG, 8 variants |
| `photos/` | 21 brand photos: people, textures, rituals, product packshots, range, gift set, bathroom shelf |
| `creatives/` | 40 finished images, one folder per project, plus `manifest.json` (concept, size, version, internal flag). `p12-brand-film/` holds the motion asset: a 15 s brand film in 9:16 and 1:1 (MP4, H.264 + AAC, with a soft original music pad), a poster frame and a thumbnail strip |
| `data/account.json` | Client, plan (Scale, 3 active slots, credits), client users, Klingit team, connections |
| `data/brand-os.json` | Brand platform (7 of 8 sections written; Visual identity now includes motion rules; Market position left empty for the "Draft with AI" demo), personas, visual identity, voice, products, sources, library, competitors |
| `data/price-list.json` | Placeholder Price List rows used by the estimates |
| `data/projects.json` | 13 projects covering every stage (see below) |
| `data/insights.json` | 6 campaigns with 318 rows of daily data (totals = the sum of the days), creative performance, CTR by format, fatigue, takeaways, What to do, market signals, competitors, trends, ideas |
| `data/audience.json`, `data/seo.json` | Connected-state data for Audience and SEO & AI visibility |
| `data/calendar.json`, `reports.json`, `agents.json`, `notifications.json`, `pm.json` | Calendar items, weekly reports, agents & templates, notifications, PM inbox and the automated decision log |

## Projects and what each one demos

| Project | Client stage | Demos |
|---|---|---|
| Pre-launch teaser | Archived | Archive filter |
| Launch: the first five | Delivered | Delivery package, performance per asset |
| Summer: sun day, every day | Delivered | Resolved pinned comment, best performer in Insights |
| lip ours: you voted | Delivered | Carousel review |
| Q4: cloud cream push | In review (v2, 2 of 2 rounds) | Ad set grid (3 concepts × 4 sizes), QC flags fixed before sending, open comments, one concept approved, v1 to compare, copy table with a suggestion |
| Holiday: the soft set | Active, in production | Internal WIP assets (never visible to the client), PM QC before sending |
| dew drop × creators | Active | Video storyboard, creator status |
| Website: product pages | Active | Web project, product page design |
| Black Friday email series | Queued #1 | Estimate approved, waiting for a slot (3 of 3 used) |
| Retail display | Queued #2 | "Approve estimate" (the client's action) |
| Spring 2027 ideas | Draft | Brief studio mid-conversation, quality 46 |
| Seasonal content agent | Agent build, Building | Agent project view, test output, build log |
| Brand film: dewy by default | In review (v1, 1 of 2 rounds) | Video review: timecoded comments and ranges, a pin on a paused frame, a Klingit note, QC with a safe-zone fix before sending, 9:16 + 1:1 versions |

## Rules for loading it
- Demo-only: flag the client `isDemo` and never send real emails or notifications for it.
- Idempotent: re-running the seed replaces the Ouhers demo data and nothing else.
- Computed things stay computed: Brand health, brief quality and the Brand OS check run on this data. Expected values are noted in the files only so they can be checked.
