---
id: 2026-06-01-mon-14
scheduledAt: 2026-06-01T18:00:00-05:00
channel: company
pillar: faq
tags: [faq, compliance-first, fund-separation, reserve-tracking, product-philosophy]
hook: "FAQ: What does 'compliance-first' actually mean in Gavelhouse?"
sources:
  - label: Compliance-first FAQ
    path: packages/shared/src/brand.ts
  - label: Fund separation implementation
    path: apps/api/src/domain/accounting/postEntry.ts
  - label: Gavelhouse plan features
    path: packages/shared/src/knowledge/seed-data.ts
---

We describe Gavelhouse as compliance-first. That phrase appears in the tagline and in most of our product copy. A few people have asked what it actually commits to, versus being marketing language.

Fair question. Here is what compliance-first means in practice, in specific terms.

**Fund separation is enforced at the database layer.** Not flagged in the UI. Not recommended in a help article. The schema does not allow a reserve transaction to post to the operating fund. This is infrastructure, not configuration.

**State-specific reserve study deadlines are tracked.** If your state requires a reserve study every three years and your last study was 30 months ago, the system tells you. Not as a one-time setup question but as an ongoing status.

**Month-end close produces attested balances.** The close workflow requires a board officer to review and confirm the closing balances for both funds. That attestation creates a dated record of board oversight.

**Audit-packet exports are first-class.** The documentation you would need to respond to a financial dispute or a regulatory inquiry is always exportable and always current.

What compliance-first does not mean: it does not mean Gavelhouse replaces a licensed reserve specialist, a CPA, or an attorney. It means the financial infrastructure defaults to the right behaviors rather than requiring the user to set them up correctly.

The distinction matters because most volunteer boards do not know what they do not know. Compliance-first is a design constraint, not a feature list.

#HOACompliance #ComplianceFirst #Gavelhouse
