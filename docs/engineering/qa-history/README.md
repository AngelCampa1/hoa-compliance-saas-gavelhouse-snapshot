# QA history

Gavelhouse was built and shipped by one person. These are the working documents
from the release-readiness process that stood in for a team's code review and QA
function. They are preserved as written, including the defects that were found
and the ones that were consciously not fixed.

They are raw. Several were produced during AI-assisted review sessions and read
like session notes rather than polished reports. That is what they were.

## Pre-launch recon

A pass over each surface before the first production deploy, mapping what
existed against what was supposed to exist.

| Document | Surface |
| --- | --- |
| [recon-01-dashboard-app.md](recon-01-dashboard-app.md) | Dashboard SPA |
| [recon-02-marketing-web.md](recon-02-marketing-web.md) | Marketing site |
| [recon-03-api.md](recon-03-api.md) | API |
| [recon-04-wiring.md](recon-04-wiring.md) | Cross-service wiring |
| [recon-05-review.md](recon-05-review.md) | Consolidated review and disposition |

## Defect inventories

Per-surface defect trackers, each item classified by severity and carried
through to a disposition.

- [defect-inventory-api.md](defect-inventory-api.md)
- [defect-inventory-app.md](defect-inventory-app.md)
- [defect-inventory-web.md](defect-inventory-web.md)

## Phase reviews

Written at the end of each build phase, covering what shipped and what was
deferred.

- [phase-1-review.md](phase-1-review.md)
- [phase-2-review.md](phase-2-review.md)
- [phase-3-review.md](phase-3-review.md)
- [phase-4-review.md](phase-4-review.md)

## End-to-end testing

Bug reports from scripted walks against the live production deployment, not a
staging environment.

- [production-bug-reports/](production-bug-reports/): six reports from May 2026
- [e2e-live-walk-findings.md](e2e-live-walk-findings.md)
- [goal-e2e-defect-hunt.md](goal-e2e-defect-hunt.md)
- [qa-pass-2026-04.md](qa-pass-2026-04.md)

## Launch

- [go-live-checklist.md](go-live-checklist.md): the gate the first production
  deploy had to pass
