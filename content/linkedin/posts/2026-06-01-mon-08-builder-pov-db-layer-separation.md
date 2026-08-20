---
id: 2026-06-01-mon-08
scheduledAt: 2026-06-01T12:00:00-05:00
channel: company
pillar: builder-pov
tags: [builder-pov, database-design, fund-separation, technical-decision, compliance]
hook: "UI-level fund separation is not enforcement. We built it at the database layer, and here is why that distinction matters."
sources:
  - label: Fund type schema
    path: apps/api/src/db/schema/accounts.ts
  - label: Per-fund balance invariant
    path: apps/api/src/domain/accounting/postEntry.ts
  - label: Audit-pack DB-layer fund separation note
    path: apps/api/src/domain/reporting/auditPack.ts
---

When I was designing the financial layer in Gavelhouse, I had to make a specific decision about where fund separation would live.

The easy path: enforce it in the UI. Show two separate buckets on the screen. Label one "Operating" and one "Reserve." Warn the user if they try to move money between them. This is how most HOA tools handle it.

The problem: that enforcement disappears the moment someone works around the interface. Direct database access, API calls, backend imports, a developer fixing something in production. The warning exists in the UI layer. Nothing below it cares.

We built it at the database layer instead.

This means the schema itself treats operating and reserve funds as separate objects with separate transaction histories. There is no path at any layer of the application where a reserve transaction posts to the operating fund or vice versa without the system refusing it. It is not a warning. It is a constraint.

Why does this matter for a HOA board?

Because the compliance question boards face is more than "did we mean to keep funds separate." It is "can you prove that funds were actually kept separate, in every transaction, without exception, for the entire period under review."

I am not claiming this makes Gavelhouse bulletproof. I am saying the design intent was to make compliance the default at the lowest level of the stack, not a feature a user has to opt into.

Angel Campa, founder

my.gavelhouse.app/signup

#TechDesign #HOACompliance #BuildingInPublic
