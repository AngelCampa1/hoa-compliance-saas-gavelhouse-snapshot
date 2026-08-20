export type JsonLdSchema = Record<string, unknown> & {
  "@context": "https://schema.org";
  "@type": string;
};

export interface PersonSchemaOpts {
  name: string;
  url?: string;
  jobTitle?: string;
  sameAs?: readonly string[];
  credentials?: string;
}

export interface ContactPointOpts {
  type: string;
  email?: string;
  url?: string;
}

export interface OrganizationSchemaOpts {
  name: string;
  url: string;
  founder?: PersonSchemaOpts;
  sameAs?: string[];
  contactPoint?: ContactPointOpts;
  areaServed?: string[] | string;
  logo?: string;
}

export interface ArticleSchemaOpts {
  headline: string;
  description: string;
  datePublished: string;
  dateModified: string;
  publisher: { name: string; url?: string } | { "@id": string };
  author?: PersonSchemaOpts;
  speakableCssSelectors?: string[];
  image?: string;
  mainEntityOfPage?: string;
  inLanguage?: string;
  lastReviewed?: string;
  about?: Array<{ "@type": string; name: string; sameAs?: string }>;
  mentions?: Array<{ "@type": string; name: string; sameAs?: string }>;
}

export interface OfferOpts {
  price: string;
  priceCurrency?: string;
  availability?: string;
  url?: string;
}

export interface ProductSchemaOpts {
  name: string;
  description: string;
  offers: OfferOpts | OfferOpts[];
  url?: string;
  image?: string;
  category?: string;
  brand?: { name: string };
}

export interface SoftwareApplicationSchemaOpts {
  name: string;
  description: string;
  offers: OfferOpts | OfferOpts[];
  url?: string;
  image?: string;
  brand?: { name: string };
  featureList?: string[];
  applicationCategory?: string;
  operatingSystem?: string;
}

export interface BreadcrumbItemInput {
  label: string;
  href: string;
}

export interface ItemListItemInput {
  name: string;
  description?: string;
  url?: string;
}

export interface HowToStepInput {
  title: string;
  content: string;
}

export interface HowToSchemaOpts {
  name: string;
  description: string;
  steps: HowToStepInput[];
}

export interface SearchActionSchemaOpts {
  siteUrl: string;
  searchPathTemplate: string;
}

export interface WebSiteSchemaOpts {
  name: string;
  url: string;
  description?: string;
  searchAction?: SearchActionSchemaOpts;
  publisherId?: string;
}

export interface CollectionPageSchemaOpts {
  name: string;
  description: string;
  url: string;
  items?: ItemListItemInput[];
}

export interface AnswerBlockOpts {
  question: string;
  answer: string;
}

export interface ExpertQuoteOpts {
  quote: string;
  person: {
    name: string;
    jobTitle?: string;
    organization?: string;
    url?: string;
    sameAs?: string[];
  };
}

export interface ComparisonTableOpts {
  name: string;
  description?: string;
}

export interface ProsConsReviewOpts {
  subject: string;
  pros: string[];
  cons: string[];
  reviewerName?: string;
  reviewer?: PersonSchemaOpts;
}

export interface ProsConsOpts {
  subject: string;
  pros: string[];
  cons: string[];
}

export interface DataTableOpts {
  name: string;
  description?: string;
  columns: string[];
  rows: string[][];
}

export interface ReviewSchemaOpts {
  quote: string;
  name: string;
  title?: string;
  reviewOf: string;
  rating?: number;
}

export interface GeoArticleSchemaOpts {
  title: string;
  description: string;
  state: string;
  country?: string;
  author?: PersonSchemaOpts;
}

export interface StatisticCitationSchemaOpts {
  stat: string;
  source: string;
  sourceUrl?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface PriceTierInput {
  name: string;
  price: string;
  monthlyPriceCents?: number;
  annualPriceCents?: number;
  annualTotalPriceCents?: number;
  annualPriceOverride?: string;
  lifetimePriceOverride?: string;
  description?: string;
  features: string[];
  ctaText?: string;
  highlighted?: boolean;
  trialText?: string;
}
