import { z } from "zod";
import { LeadMagnetSlugSchema } from "@boardstack/shared";

const answerItemSchema = z.union([
  z.object({ q: z.string(), a: z.string() }),
  z
    .object({ question: z.string(), answer: z.string() })
    .transform(({ question, answer }) => ({ q: question, a: answer })),
]);
const answerSchema = z.array(answerItemSchema).optional();
const requiredAnswerSchema = z.array(answerItemSchema).min(1);
const prosConsSchema = z
  .array(
    z.object({
      subject: z.string(),
      pros: z.array(z.string()),
      cons: z.array(z.string()),
    }),
  )
  .optional();
const pricingStatSchema = z
  .array(
    z.object({
      stat: z.string(),
      source: z.string(),
      sourceUrl: z.string().optional(),
    }),
  )
  .optional();
const tableDataSchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    columns: z.array(z.string()),
    rows: z.array(z.array(z.string())),
  })
  .optional();
const requiredTableDataSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  columns: z.array(z.string()).min(2),
  rows: z.array(z.array(z.string())).min(1),
});
const sourceSchema = z.object({
  title: z.string(),
  source: z.string(),
  url: z.string().url(),
  lastChecked: z.string(),
});

export const baseContentSchema = z.object({
  title: z.string(),
  description: z.string(),
  publishedAt: z.string(),
  updatedAt: z.string(),
  reviewedAt: z.string().optional(),
  buyerStage: z.enum(["tofu", "mofu", "bofu"]),
  primaryKeyword: z.string(),
  searchIntent: z.enum([
    "informational",
    "commercial",
    "transactional",
    "navigational",
  ]),
  sources: z.array(sourceSchema).min(1),
  ctaMode: z.enum(["educate", "evaluate", "convert"]).optional(),
  schema: z
    .enum([
      "Article",
      "FAQPage",
      "HowTo",
      "Product",
      "ItemList",
      "SoftwareApplication",
    ])
    .default("Article"),
  bluf: z.string(),
  faqs: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
  relatedPages: z.array(z.string()).min(1),
  statistics: z
    .array(
      z.object({
        stat: z.string(),
        source: z.string(),
        sourceUrl: z.string().optional(),
      }),
    )
    .default([]),
  noindex: z.boolean().default(false),
  draft: z.boolean().default(false),
  ogImage: z.string().optional(),
  tags: z.array(z.string()).default([]),
  magnetSlug: LeadMagnetSlugSchema.optional(),
  targetPersona: z.array(z.string()).optional(),
});

export const alternativeSchema = baseContentSchema.extend({
  competitor: z.object({
    name: z.string(),
    slug: z.string(),
    url: z.string().optional(),
    pricing: z.string(),
    weakness: z.string(),
    setupFee: z.string().optional(),
    pros: z.array(z.string()).default([]),
    cons: z.array(z.string()).default([]),
  }),
  pros: z.array(z.string()).default([]),
  cons: z.array(z.string()).default([]),
  proscons: prosConsSchema,
  answers: requiredAnswerSchema,
  pricingStats: pricingStatSchema,
  tableData: requiredTableDataSchema,
  definitions: z
    .array(z.object({ term: z.string(), definition: z.string() }))
    .default([]),
  expertQuotes: z
    .array(
      z.object({
        quote: z.string(),
        personName: z.string(),
        jobTitle: z.string().optional(),
        organization: z.string().optional(),
      }),
    )
    .optional(),
});

export const comparisonSchema = baseContentSchema.extend({
  competitorA: z.object({
    name: z.string(),
    slug: z.string(),
    pricing: z.string().optional(),
    pros: z.array(z.string()).optional(),
    cons: z.array(z.string()).optional(),
  }),
  competitorB: z.object({
    name: z.string(),
    slug: z.string(),
    pricing: z.string().optional(),
    pros: z.array(z.string()).optional(),
    cons: z.array(z.string()).optional(),
  }),
  verdict: z.string(),
  disableProsConsSchema: z.boolean().default(false),
  tableData: requiredTableDataSchema,
  pricingStats: pricingStatSchema,
  proscons: prosConsSchema,
  answers: requiredAnswerSchema,
  definitions: z
    .array(z.object({ term: z.string(), definition: z.string() }))
    .optional(),
  expertQuotes: z
    .array(
      z.object({
        quote: z.string(),
        personName: z.string(),
        jobTitle: z.string().optional(),
        organization: z.string().optional(),
      }),
    )
    .optional(),
});

export const pricingBreakdownSchema = baseContentSchema.extend({
  competitor: z.object({
    name: z.string(),
    slug: z.string(),
    pricing: z.string(),
  }),
  tiers: z.array(
    z.object({
      name: z.string(),
      price: z.string(),
      features: z.array(z.string()),
    }),
  ),
  hiddenCosts: z.array(z.string()),
  tableData: requiredTableDataSchema,
  pricingStats: pricingStatSchema,
  answers: requiredAnswerSchema,
  expertQuotes: z
    .array(
      z.object({
        quote: z.string(),
        personName: z.string(),
        jobTitle: z.string().optional(),
        organization: z.string().optional(),
      }),
    )
    .optional(),
});

export const listicleSchema = baseContentSchema.extend({
  category: z.string(),
  qualifier: z.string(),
  tools: z.array(
    z.object({
      name: z.string(),
      summary: z.string(),
      pros: z.array(z.string()),
      cons: z.array(z.string()),
      pricing: z.string(),
      verdict: z.string(),
    }),
  ),
  tableData: requiredTableDataSchema,
  answers: requiredAnswerSchema,
  pricingStats: pricingStatSchema,
  definitions: z
    .array(z.object({ term: z.string(), definition: z.string() }))
    .optional(),
  proscons: prosConsSchema,
  expertQuotes: z
    .array(
      z.object({
        quote: z.string(),
        personName: z.string(),
        jobTitle: z.string().optional(),
        organization: z.string().optional(),
      }),
    )
    .optional(),
});

export const guideSchema = baseContentSchema.extend({
  steps: z
    .array(z.object({ title: z.string(), content: z.string() }))
    .optional(),
  timeEstimate: z.string().optional(),
  difficulty: z.string().optional(),
  definitions: z
    .array(z.object({ term: z.string(), definition: z.string() }))
    .min(1),
  answers: requiredAnswerSchema,
  proscons: prosConsSchema,
  expertQuotes: z
    .array(
      z.object({
        quote: z.string(),
        personName: z.string(),
        jobTitle: z.string().optional(),
        organization: z.string().optional(),
      }),
    )
    .optional(),
  tableData: tableDataSchema,
  pricingStats: pricingStatSchema,
});

export const statePageSchema = baseContentSchema.extend({
  state: z.string(),
  stateCode: z.string(),
  // Generic fields (both verticals)
  marketSize: z.number().optional(),
  topMarkets: z
    .array(
      z.object({
        name: z.string(),
        count: z.number(),
        label: z.string().optional(),
      }),
    )
    .default([]),
  regulations: z
    .array(
      z.object({
        heading: z.string(),
        content: z.string(),
        variant: z.enum(["info", "warning", "success"]).default("info"),
      }),
    )
    .default([]),
  // Legacy fields (optional for backward compat)
  establishmentCount: z.number().optional(),
  topMetros: z
    .array(z.object({ name: z.string(), count: z.number() }))
    .optional(),
  licensingNotes: z.string().optional(),
  seasonalNotes: z.string().optional(),
  // SEO blocks
  pricingStats: pricingStatSchema,
  tableData: requiredTableDataSchema,
  answers: requiredAnswerSchema,
  definitions: z
    .array(z.object({ term: z.string(), definition: z.string() }))
    .default([]),
  expertQuotes: z
    .array(
      z.object({
        quote: z.string(),
        personName: z.string(),
        jobTitle: z.string().optional(),
        organization: z.string().optional(),
      }),
    )
    .optional(),
});

export const verticalPageSchema = baseContentSchema.extend({
  verticalType: z.string(),
  keyPainPoints: z.array(z.string()),
  commonGrantTypes: z.array(z.string()),
  complianceNotes: z.string(),
  estimatedOrgCount: z.number().optional(),
  pricingStats: pricingStatSchema,
  tableData: tableDataSchema,
  answers: answerSchema,
});

export const orgTypePageSchema = baseContentSchema.extend({
  orgType: z.string(),
  orgTypeSlug: z.string(),
  estimatedCount: z.number().optional(),
  uniqueNeeds: z.array(z.string()),
  complianceNotes: z.string().optional(),
  answers: answerSchema,
});

export const featureSchema = baseContentSchema.extend({
  tableData: tableDataSchema,
  proscons: prosConsSchema,
  answers: requiredAnswerSchema,
  pricingStats: pricingStatSchema,
});

export const reviewSchema = baseContentSchema.extend({
  competitor: z.object({
    name: z.string(),
    slug: z.string(),
    url: z.string().optional(),
    pricing: z.string(),
  }),
  verdict: z.string(),
  tableData: tableDataSchema,
  proscons: prosConsSchema,
  answers: answerSchema,
  pricingStats: pricingStatSchema,
});

export const phasePageSchema = baseContentSchema.extend({
  phase: z.enum([
    "follicular",
    "ovulatory",
    "luteal",
    "menstrual",
    "hormone",
    "cycle",
  ]),
  definitions: z
    .array(z.object({ term: z.string(), definition: z.string() }))
    .default([]),
  answers: answerSchema,
  expertQuotes: z
    .array(
      z.object({
        quote: z.string(),
        personName: z.string(),
        jobTitle: z.string().optional(),
        organization: z.string().optional(),
      }),
    )
    .optional(),
});

export type PhasePageEntry = z.infer<typeof phasePageSchema>;

export const goalPageSchema = baseContentSchema.extend({
  audience: z.enum([
    "perimenopause",
    "menopause",
    "over-40",
    "active-recovery",
    "beginners",
    "lifters",
    "general",
  ]),
  definitions: z
    .array(z.object({ term: z.string(), definition: z.string() }))
    .default([]),
  answers: answerSchema,
  expertQuotes: z
    .array(
      z.object({
        quote: z.string(),
        personName: z.string(),
        jobTitle: z.string().optional(),
        organization: z.string().optional(),
      }),
    )
    .optional(),
  statisticCitations: pricingStatSchema,
  tableData: tableDataSchema,
});

export type GoalPageEntry = z.infer<typeof goalPageSchema>;

export const symptomsSchema = guideSchema;

export const leadMagnetSchema = z.object({
  title: z.string(),
  description: z.string(),
  publishedAt: z.string(),
  updatedAt: z.string(),
  reviewedAt: z.string().optional(),
  bluf: z.string(),
  freePreviewSections: z.number().default(2),
  ogImage: z.string().optional(),
  tags: z.array(z.string()).default([]),
  relatedPages: z.array(z.string()).min(1),
  noindex: z.boolean().default(false),
  primaryKeyword: z.string(),
  searchIntent: z.enum([
    "informational",
    "commercial",
    "transactional",
    "navigational",
  ]),
  sources: z.array(sourceSchema).min(1),
  answers: requiredAnswerSchema,
  definitions: z
    .array(z.object({ term: z.string(), definition: z.string() }))
    .min(1),
  buyerStage: z.enum(["tofu", "mofu", "bofu"]).default("tofu"),
  faqs: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
  schema: z
    .enum([
      "Article",
      "FAQPage",
      "HowTo",
      "Product",
      "ItemList",
      "SoftwareApplication",
    ])
    .default("Article"),
});

export const productPageSchema = baseContentSchema.extend({
  productCategory: z.string(),
  keyFeatures: z.array(z.string()).min(3),
  targetRoles: z.array(z.string()).default([]),
  tableData: tableDataSchema,
  answers: requiredAnswerSchema,
  proscons: prosConsSchema,
  pricingStats: pricingStatSchema,
  expertQuotes: z
    .array(
      z.object({
        quote: z.string(),
        personName: z.string(),
        jobTitle: z.string().optional(),
        organization: z.string().optional(),
      }),
    )
    .optional(),
});

export const solutionPageSchema = baseContentSchema.extend({
  solutionCategory: z.enum(["role", "segment", "migration"]),
  audienceLabel: z.string(),
  painPoints: z.array(z.string()).min(3),
  outcomes: z.array(z.string()).min(3),
  relatedProductSlugs: z.array(z.string()).default([]),
  tableData: tableDataSchema,
  answers: requiredAnswerSchema,
  proscons: prosConsSchema,
  pricingStats: pricingStatSchema,
});
