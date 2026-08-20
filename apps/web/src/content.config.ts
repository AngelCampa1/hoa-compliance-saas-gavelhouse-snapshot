import { defineCollection } from "astro:content";
import {
  alternativeSchema,
  comparisonSchema,
  pricingBreakdownSchema,
  listicleSchema,
  guideSchema,
  statePageSchema,
  leadMagnetSchema,
  productPageSchema,
  solutionPageSchema,
} from "./content-schemas/schemas.js";

const alternatives = defineCollection({
  type: "content",
  schema: alternativeSchema,
});

const comparisons = defineCollection({
  type: "content",
  schema: comparisonSchema,
});

const pricingBreakdowns = defineCollection({
  type: "content",
  schema: pricingBreakdownSchema,
});

const listicles = defineCollection({
  type: "content",
  schema: listicleSchema,
});

const guides = defineCollection({
  type: "content",
  schema: guideSchema,
});

const statePages = defineCollection({
  type: "content",
  schema: statePageSchema,
});

const leadMagnets = defineCollection({
  type: "content",
  schema: leadMagnetSchema,
});

const productPages = defineCollection({
  type: "content",
  schema: productPageSchema,
});

const solutions = defineCollection({
  type: "content",
  schema: solutionPageSchema,
});

export const collections = {
  alternatives,
  comparisons,
  "pricing-breakdowns": pricingBreakdowns,
  listicles,
  guides,
  "state-pages": statePages,
  "lead-magnets": leadMagnets,
  "product-pages": productPages,
  solutions,
};
