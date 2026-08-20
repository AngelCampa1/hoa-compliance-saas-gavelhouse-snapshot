---
id: 2026-05-20-wed-07
scheduledAt: 2026-05-20T11:00:00-05:00
channel: company
pillar: builder-pov
tags: [state compliance, built-in vs bolt-on, product design]
hook: "State-specific compliance can't be a dropdown. It has to be built into how the product works."
---

State-specific compliance can't be a dropdown. It has to be built into how the product works.

Early in building Gavelhouse, I considered the "state selector" approach: let the board select their state, then surface the relevant requirements as informational text.

That's a documentation feature, not a compliance feature.

California, Florida, Maryland, New Jersey, and Washington have different reserve study cycles, different funding minimums, different commingling penalties, and different disclosure requirements. If the software doesn't know which state the community is in and apply the right rules at the data layer, the board still has to manually ensure compliance.

"Here are California's requirements" is useful information. "Your current reserve contribution rate does not meet California's minimum, and you have 47 days before your required disclosure is due" is a compliance tool.

The distinction matters because volunteer board members are not compliance specialists. They're homeowners who raised their hand to help. They should not need to know every statute in their state and manually map it to their software's output.

We built state compliance into the rules that govern what the system accepts and what it flags, not into a sidebar with links to statutes.

That's a harder build. It's also the only approach that actually reduces board liability.

#StateCompliance #HOASoftware #ProductDesign
