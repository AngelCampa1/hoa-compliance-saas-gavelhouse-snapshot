---
id: 2026-05-19-tue-07
scheduledAt: 2026-05-19T11:00:00-05:00
channel: company
pillar: builder-pov
tags: [product decisions, mobile app, honest tradeoffs]
hook: "Gavelhouse doesn't have a native mobile app. Here's why we made that call."
---

Gavelhouse doesn't have a native mobile app. Here's why we made that call.

Building a native mobile app for iOS and Android is a significant investment. It requires maintaining two additional codebases, handling platform-specific deployment cycles, and keeping parity with the web product as features change.

For a volunteer board treasurer doing monthly reconciliation, reviewing a reserve fund report, or approving a budget, the workflow is not mobile-first. These are not notifications to tap and dismiss. They are tasks that benefit from a full screen and a keyboard.

We built a web interface that works on mobile browsers instead. It's not as polished as a native app. The experience on a phone screen is functional, not optimized.

That was a deliberate choice to prioritize building the compliance features the product actually needed before investing in mobile app infrastructure.

Will we build native apps eventually? Probably. It's not off the table. But we didn't want to ship a mobile app that looked good and had shallow compliance features. We'd rather have solid compliance features on a web interface.

I'm telling you this because "no native mobile app" is a real limitation. If you need a mobile-first experience for your board, that's a fair reason to evaluate alternatives. I'd rather you know before signing up.

#ProductDesign #HOASoftware #StartupTransparency
