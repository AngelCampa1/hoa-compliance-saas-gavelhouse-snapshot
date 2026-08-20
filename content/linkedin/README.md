# Gavelhouse LinkedIn Content

This folder contains prepared Gavelhouse LinkedIn company-page posts.

- Batch 1: 285 posts for May 12 to June 1, 2026.
- Batch 2 extension: 195 additional posts for June 2 to June 14, 2026.
- Current manifest coverage: 480 posts total, with 15 posts/day prepared from
  June 1 to June 14.

These posts are prepared for Postiz. Do not treat them as uploaded unless a
matching `.uploaded.json` receipt exists next to the post file.

## June 2026 strategy

The June 1 to June 14 extension is based on a LinkedIn analytics export
downloaded from the company page's analytics tab.

The active analytics window was short: 80 organic posts from May 12 to May 17,
with sparse engagement. State-law and Fannie Mae urgency drove reach, while
QuickBooks/fund-separation and board-liability angles produced the limited
engagement signal. See `content/linkedin/june-2026-strategy.md` for the
evidence summary and the 15/day content mix.

## Pillar distribution

| Pillar                | Posts | Focus                                                     |
| --------------------- | ----- | --------------------------------------------------------- |
| state-compliance      | 127   | One state per post: statute, deadline, penalty            |
| board-liability       | 62    | Fiduciary duty, personal exposure, D&O, audit prep        |
| reserve-mechanics     | 57    | Reserve studies, percent-funded, 30-yr plan, underfunding |
| board-ops             | 51    | Month-end close, handoff, dues collection, owner portal   |
| fannie-mae            | 45    | LL-2026-03 countdown, 15% floor, Jan 4 2027               |
| anti-quickbooks       | 36    | Why generic accounting software fails HOA boards          |
| faq                   | 30    | Each FAQ anchored to a statutory fact                     |
| builder-pov           | 28    | Why we built Gavelhouse, design decisions                 |
| lead-magnet           | 28    | 50-state guide at gavelhouse.app/free/                    |
| competitor-commentary | 16    | Per-unit pricing critique, category commentary            |

For the prepared June 1 to June 14 window only, the manifest contains:

| Pillar            | Posts |
| ----------------- | ----: |
| state-compliance  |    56 |
| board-ops         |    31 |
| fannie-mae        |    25 |
| reserve-mechanics |    19 |
| board-liability   |    18 |
| builder-pov       |    17 |
| faq               |    16 |
| lead-magnet       |    15 |
| anti-quickbooks   |    13 |

## Cadence

- May 12 to June 1: original Batch 1 cadence.
- June 1 to June 14: 15 posts/day prepared in `manifest.json`.
- Slots (CT): 06:30, 07:00, 07:30, 08:00, 09:00, 10:00, 11:00, 12:00, 13:00, 14:00, 15:00, 16:00, 17:00, 18:00, 20:00 on weekdays; 07:00, 08:00, 09:30, 10:30, 12:00, 13:30, 15:00, 16:30, 18:00, 20:00 on weekends.

## Uploading to Postiz

### Option A - API upload (automated)

```bash
export POSTIZ_API_KEY=your_key_here
export POSTIZ_INTEGRATION_ID=your_linkedin_company_page_integration_id

# Dry run: print the full schedule, no network calls
node scripts/postiz-upload.mjs --dry-run

# Upload all posts
node scripts/postiz-upload.mjs

# Upload only from a specific date
node scripts/postiz-upload.mjs --from 2026-05-18
```

The uploader targets 25 req/hr (safely under the 30 req/hr limit), writes a `.uploaded.json` receipt next to each `.md` file on success, and skips already-uploaded posts on re-runs.

### Option B - Manual paste

Each `.md` file is self-describing. Open the file, copy the body (everything after the second `---` line), paste into Postiz at the `scheduledAt` time shown in the frontmatter.

## Editing a post

1. Edit the `.md` file.
2. Run `node scripts/lint-linkedin-posts.mjs` to verify no rules are broken.
3. Re-upload that post via Postiz manually or delete the `.uploaded.json` receipt and re-run the uploader.

## Adding posts

Use the existing naming pattern: `YYYY-MM-DD-dow-NN-slug.md`. Add the new file to `manifest.json` in date order. Run lint before uploading.

## Voice rules (non-negotiable)

- **No em dashes** (- - --). Use commas, colons, or sentence breaks.
- **No AI tells**: "worth noting", "in today's", "leverage" as a verb, "delve", "seamless", "cutting-edge", "utilize", "navigate the", "game-changer", etc.
- **Builder perspective**: "we built Gavelhouse because..." - never claim HOA law expertise.
- **Compliance-first**: lead with liability risk and statutory requirements, not emotion.
- **Zero fabrication**: every factual claim (statute citation, penalty, stat) must trace to `packages/shared/src/compliance/states.ts` or `packages/shared/src/brand.ts`.
- **Pricing**: Y80OFF annual effective prices are $10/$27/$50 per month for Starter, Growth, and Scale when billed annually. Monthly billing uses M80OFF for 80% off the first year. Portfolio is custom and unpriced. No per-unit fees.

Run `node scripts/lint-linkedin-posts.mjs --verbose` to check all posts at any time.
