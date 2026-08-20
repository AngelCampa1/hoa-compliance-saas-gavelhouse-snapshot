---
id: 2026-05-18-mon-03
scheduledAt: 2026-05-18T07:30:00-05:00
channel: company
pillar: builder-pov
tags: [product design, fund separation, builder]
hook: "We enforce fund separation at the database layer. Not in the UI. Here's why that matters."
---

We enforce fund separation at the database layer. Not in the UI. Here's why that matters.

Most accounting tools let you create separate accounts and label them "Operating" and "Reserve." That's a convention. Nothing stops a transaction from posting to the wrong account. Nothing stops a report from aggregating both together. The separation lives in a spreadsheet column header, not in the system.

We built Gavelhouse so that operating and reserve funds are structurally separate tables in the database. A transaction can't be entered in a way that would commingle the funds. The schema enforces it before any code runs.

This is a design tradeoff. It made the product harder to build. It means we can't serve property managers who need more flexible fund structures. That's an intentional constraint.

We made it because state statutes treat commingling as a violation regardless of whether it was accidental. A board that accidentally commingled funds through a UI that allowed it doesn't get a pass in California or Maryland.

Compliance has to be structural. A label isn't compliance.

#HOASoftware #ProductDesign #ReserveFunds
