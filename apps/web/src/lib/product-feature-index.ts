export const FEATURE_PAGE_GROUPS = [
  {
    title: "Reserve and financial controls",
    problem: "Boards lose trust when money records live in too many files.",
    solution: "Gavelhouse keeps funds, dues, and reports tied together.",
    slugs: [
      "hoa-reserve-fund-compliance-software",
      "hoa-fund-accounting-software",
      "hoa-financial-reporting-software",
      "hoa-dues-collection-software",
      "hoa-collections-software",
    ],
  },
  {
    title: "Governance and board decisions",
    problem: "Meetings, votes, and requests get lost after board roles change.",
    solution:
      "Gavelhouse keeps decisions where the next officer can find them.",
    slugs: [
      "hoa-board-meeting-software",
      "hoa-voting-software",
      "hoa-architectural-review-software",
      "hoa-violation-tracking-software",
      "hoa-governance-workflow-software",
    ],
  },
  {
    title: "Owner operations and community access",
    problem: "Owners need answers while the board is already busy.",
    solution: "Gavelhouse gives owners a clearer place to check basic work.",
    slugs: [
      "hoa-owner-portal-software",
      "hoa-website-software",
      "hoa-work-order-software",
    ],
  },
] as const;

export const FEATURE_PAGE_SLUGS = FEATURE_PAGE_GROUPS.flatMap(
  (group) => group.slugs,
);
