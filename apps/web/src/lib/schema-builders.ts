import type {
  JsonLdSchema,
  BreadcrumbItemInput,
  ArticleSchemaOpts,
  OrganizationSchemaOpts,
  ProductSchemaOpts,
  SoftwareApplicationSchemaOpts,
  ItemListItemInput,
  HowToSchemaOpts,
  SearchActionSchemaOpts,
  WebSiteSchemaOpts,
  ReviewSchemaOpts,
  GeoArticleSchemaOpts,
  StatisticCitationSchemaOpts,
  PriceTierInput,
  CollectionPageSchemaOpts,
  PersonSchemaOpts,
} from "./schema-types";
import type { FaqItem } from "./types";

/** Joins a base URL and a path, stripping the trailing slash from base to prevent double slashes. */
export function joinUrl(base: string, path: string): string {
  return base.replace(/\/$/, "") + (path.startsWith("/") ? path : `/${path}`);
}

/** Strips non-numeric characters from a price string. Returns "0" when no digits are found (e.g. "Free", "Custom"). */
function stripNonNumeric(price: string): string {
  const stripped = price.replace(/[^0-9.]/g, "");
  return stripped === "" ? "0" : stripped;
}

/** Returns true if the price string contains at least one digit. */
function hasNumericDigits(price: string): boolean {
  return /\d/.test(price);
}

/** Extracts each numeric token from a price string. Useful for ranges like "$10-$50/mo". */
function extractNumericValues(price: string): number[] {
  const matches = price.match(/\d+(?:\.\d+)?/g) ?? [];
  return matches.map((value) => Number.parseFloat(value));
}

export function buildBreadcrumbSchema(
  items: BreadcrumbItemInput[],
  siteUrl: string,
): JsonLdSchema {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: { "@id": joinUrl(siteUrl, item.href), name: item.label },
    })),
  };
}

export function buildFaqPageSchema(faqs: FaqItem[]): JsonLdSchema {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.a,
      },
    })),
  };
}

export function buildArticleSchema(opts: ArticleSchemaOpts): JsonLdSchema {
  const {
    headline,
    description,
    datePublished,
    dateModified,
    publisher,
    author,
    speakableCssSelectors,
    image,
    mainEntityOfPage,
    inLanguage = "en",
    lastReviewed,
    about,
    mentions,
  } = opts;

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    description,
    datePublished,
    dateModified,
    inLanguage,
    publisher:
      "@id" in publisher
        ? publisher
        : {
            "@type": "Organization",
            name: publisher.name,
            ...(publisher.url !== undefined && { url: publisher.url }),
          },
    ...(author && {
      author: {
        "@type": "Person",
        name: author.name,
        ...(author.url && { url: author.url }),
        ...(author.jobTitle && { jobTitle: author.jobTitle }),
        ...(author.sameAs && { sameAs: author.sameAs }),
        ...(author.credentials && { hasCredential: author.credentials }),
      },
    }),
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: speakableCssSelectors ?? [".bluf-block"],
    },
    ...(image && { image }),
    ...(mainEntityOfPage && {
      mainEntityOfPage: { "@type": "WebPage", "@id": mainEntityOfPage },
    }),
    ...(lastReviewed && { lastReviewed }),
    ...(about && about.length > 0 && { about }),
    ...(mentions && mentions.length > 0 && { mentions }),
  };
}

export function buildOrganizationSchema(
  opts: OrganizationSchemaOpts,
): JsonLdSchema {
  const { name, url, founder, sameAs, contactPoint, areaServed, logo } = opts;
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name,
    url,
    ...(founder && {
      founder: {
        "@type": "Person",
        name: founder.name,
        ...(founder.url && { url: founder.url }),
        ...(founder.jobTitle && { jobTitle: founder.jobTitle }),
        ...(founder.sameAs && { sameAs: founder.sameAs }),
        ...(founder.credentials && { hasCredential: founder.credentials }),
      },
    }),
    ...(sameAs && { sameAs }),
    ...(contactPoint && {
      contactPoint: {
        "@type": "ContactPoint",
        contactType: contactPoint.type,
        ...(contactPoint.email && { email: contactPoint.email }),
        ...(contactPoint.url && { url: contactPoint.url }),
      },
    }),
    ...(areaServed && { areaServed }),
    ...(logo && { logo: { "@type": "ImageObject", url: logo } }),
  };
}

export function buildProductSchema(opts: ProductSchemaOpts): JsonLdSchema {
  const { name, description, offers, url, image, category, brand } = opts;

  const offersValue = Array.isArray(offers)
    ? (() => {
        if (offers.length === 0) {
          throw new Error("buildProductSchema: offers array must not be empty");
        }
        const validPrices = offers
          .filter((o) => hasNumericDigits(o.price))
          .map((o) => parseFloat(stripNonNumeric(o.price)))
          .filter((n) => Number.isFinite(n));
        const aggregatePricing =
          validPrices.length > 0
            ? {
                lowPrice: String(Math.min(...validPrices)),
                highPrice: String(Math.max(...validPrices)),
              }
            : {};
        return {
          "@type": "AggregateOffer",
          ...aggregatePricing,
          priceCurrency: "USD",
          offerCount: offers.length,
          offers: offers.map((o) => ({
            "@type": "Offer",
            price: stripNonNumeric(o.price),
            priceCurrency: o.priceCurrency ?? "USD",
            ...(o.availability !== undefined && {
              availability: o.availability,
            }),
            ...(o.url !== undefined && { url: o.url }),
          })),
        };
      })()
    : {
        "@type": "Offer",
        price: stripNonNumeric(offers.price),
        priceCurrency: offers.priceCurrency ?? "USD",
        ...(offers.availability !== undefined && {
          availability: offers.availability,
        }),
        ...(offers.url !== undefined && { url: offers.url }),
      };

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description,
    ...(url && { url }),
    ...(image && { image }),
    ...(category && { category }),
    offers: offersValue,
    ...(brand && { brand: { "@type": "Brand", name: brand.name } }),
  };
}

export function buildSoftwareApplicationSchema(
  opts: SoftwareApplicationSchemaOpts,
): JsonLdSchema {
  const {
    name,
    description,
    offers,
    url,
    image,
    brand,
    featureList,
    applicationCategory = "BusinessApplication",
    operatingSystem = "Web, iOS, Android",
  } = opts;
  const offerNode = Array.isArray(offers)
    ? (() => {
        if (offers.length === 0) {
          throw new Error(
            "buildSoftwareApplicationSchema: offers array must not be empty",
          );
        }
        const validPrices = offers
          .filter((offer) => hasNumericDigits(offer.price))
          .map((offer) => parseFloat(stripNonNumeric(offer.price)))
          .filter((price) => Number.isFinite(price));
        const aggregatePricing =
          validPrices.length > 0
            ? {
                lowPrice: String(Math.min(...validPrices)),
                highPrice: String(Math.max(...validPrices)),
              }
            : {};
        return {
          "@type": "AggregateOffer",
          ...aggregatePricing,
          priceCurrency: "USD",
          offerCount: offers.length,
          offers: offers.map((offer) => ({
            "@type": "Offer",
            price: stripNonNumeric(offer.price),
            priceCurrency: offer.priceCurrency ?? "USD",
            ...(offer.availability !== undefined && {
              availability: offer.availability,
            }),
            ...(offer.url !== undefined && { url: offer.url }),
          })),
        };
      })()
    : (() => {
        const numericValues = extractNumericValues(offers.price).filter(
          (value) => Number.isFinite(value),
        );
        return numericValues.length > 1
          ? {
              "@type": "AggregateOffer",
              lowPrice: String(Math.min(...numericValues)),
              highPrice: String(Math.max(...numericValues)),
              priceCurrency: offers.priceCurrency ?? "USD",
              offerCount: numericValues.length,
              ...(offers.url !== undefined && { url: offers.url }),
              ...(offers.availability !== undefined && {
                availability: offers.availability,
              }),
            }
          : {
              "@type": "Offer",
              price: stripNonNumeric(offers.price),
              priceCurrency: offers.priceCurrency ?? "USD",
              ...(offers.url !== undefined && { url: offers.url }),
              ...(offers.availability !== undefined && {
                availability: offers.availability,
              }),
            };
      })();
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name,
    description,
    ...(url && { url }),
    ...(image && { image }),
    ...(brand && { brand: { "@type": "Brand", name: brand.name } }),
    ...(featureList && featureList.length > 0 && { featureList }),
    applicationCategory,
    operatingSystem,
    offers: offerNode,
  };
}

export function buildItemListSchema(items: ItemListItemInput[]): JsonLdSchema {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      ...(item.description !== undefined && { description: item.description }),
      ...(item.url !== undefined && { url: item.url }),
    })),
  };
}

export function buildHowToSchema(opts: HowToSchemaOpts): JsonLdSchema {
  const { name, description, steps } = opts;
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name,
    description,
    step: steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.title,
      text: step.content,
    })),
  };
}

/**
 * Builds a SearchAction object for embedding inside a WebSite schema as `potentialAction`.
 * SearchAction is NOT a valid top-level Schema.org entity -- it must be nested inside a
 * WebSite node that already provides `@context`. Use `buildWebSiteSchema` to include it.
 */
export function buildSearchActionSchema(
  opts: SearchActionSchemaOpts,
): Omit<JsonLdSchema, "@context"> {
  const { siteUrl, searchPathTemplate } = opts;
  return {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: joinUrl(siteUrl, searchPathTemplate),
    },
    "query-input": "required name=search_term_string",
  };
}

export function buildWebSiteSchema(opts: WebSiteSchemaOpts): JsonLdSchema {
  const { name, url, description, searchAction, publisherId } = opts;

  let potentialAction: Record<string, unknown> | undefined;
  if (searchAction) {
    potentialAction = buildSearchActionSchema(searchAction);
  }

  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    url,
    ...(description && { description }),
    ...(potentialAction && { potentialAction }),
    ...(publisherId && { publisher: { "@id": publisherId } }),
  };
}

export function buildReviewSchema(opts: ReviewSchemaOpts): JsonLdSchema {
  const { quote, name, title, reviewOf, rating } = opts;
  return {
    "@context": "https://schema.org",
    "@type": "Review",
    reviewBody: quote,
    author: {
      "@type": "Person",
      name,
      ...(title && { jobTitle: title }),
    },
    itemReviewed: {
      "@type": "SoftwareApplication",
      name: reviewOf,
    },
    ...(rating && {
      reviewRating: {
        "@type": "Rating",
        ratingValue: rating,
        bestRating: 5,
      },
    }),
  };
}

export function buildGeoArticleSchema(
  opts: GeoArticleSchemaOpts,
): JsonLdSchema {
  const { title, description, state, country = "United States", author } = opts;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    ...(author && {
      author: {
        "@type": "Person",
        name: author.name,
        ...(author.url && { url: author.url }),
        ...(author.jobTitle && { jobTitle: author.jobTitle }),
        ...(author.sameAs && { sameAs: author.sameAs }),
        ...(author.credentials && { hasCredential: author.credentials }),
      },
    }),
    about: {
      "@type": "State",
      name: state,
      containedInPlace: {
        "@type": "Country",
        name: country,
      },
    },
  };
}

/**
 * Uses Quotation -- semantically correct for citing a statistic from a source.
 * Claim/ClaimReview is for fact-checkers reviewing third-party claims, not for
 * original citations. Quotation correctly models "we are quoting this stat from
 * this source".
 */
export function buildStatisticCitationSchema(
  opts: StatisticCitationSchemaOpts,
): JsonLdSchema {
  const { stat, source, sourceUrl } = opts;
  return {
    "@context": "https://schema.org",
    "@type": "Quotation",
    text: stat,
    citation: {
      "@type": "WebPage",
      ...(sourceUrl !== undefined && { url: sourceUrl }),
      name: source,
    },
  };
}

/**
 * Merges two sources of FAQ items into a single FAQPage schema,
 * deduplicating by question text (case-insensitive).
 * Returns undefined when the combined list is empty.
 *
 * `primary` items win on conflict. Pass `[]` as primary when the caller has
 * no persistent FAQ set (e.g. article-page layouts that only surface
 * per-page inline answers via the `secondary` argument).
 */
export function mergeFaqSources(
  primary: FaqItem[],
  secondary: { question: string; answer: string }[],
): JsonLdSchema | undefined {
  const secondaryAsFaqItems: FaqItem[] = secondary.map((item) => ({
    q: item.question,
    a: item.answer,
  }));

  const seen = new Set<string>();
  const merged: FaqItem[] = [];

  for (const item of primary) {
    const key = item.q.trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }

  for (const item of secondaryAsFaqItems) {
    const key = item.q.trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }

  if (merged.length === 0) {
    return undefined;
  }

  return buildFaqPageSchema(merged);
}

export function buildDefinedTermSchema({
  term,
  definition,
}: {
  term: string;
  definition: string;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    name: term,
    description: definition,
  };
}

export function buildPriceSpecificationSchema(
  tiers: PriceTierInput[],
): JsonLdSchema {
  const offers = tiers.map((tier) => {
    const numericPrice = stripNonNumeric(tier.price);
    const hasPrice = hasNumericDigits(tier.price);
    return {
      "@type": "Offer",
      name: tier.name,
      description: tier.features.join(", "),
      ...(hasPrice && { price: numericPrice, priceCurrency: "USD" }),
    };
  });

  const validPrices = tiers
    .filter((tier) => hasNumericDigits(tier.price))
    .map((tier) => parseFloat(stripNonNumeric(tier.price)))
    .filter((n) => Number.isFinite(n));

  const aggregatePricing =
    validPrices.length > 0
      ? {
          lowPrice: String(Math.min(...validPrices)),
          highPrice: String(Math.max(...validPrices)),
          priceCurrency: "USD",
        }
      : {};

  return {
    "@context": "https://schema.org",
    "@type": "AggregateOffer",
    ...aggregatePricing,
    offerCount: tiers.length,
    offers,
  };
}

export function buildCollectionPageSchema(
  opts: CollectionPageSchemaOpts,
): JsonLdSchema {
  const { name, description, url, items } = opts;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    description,
    url,
    ...(items &&
      items.length > 0 && {
        mainEntity: {
          "@type": "ItemList",
          itemListElement: items.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: item.name,
            ...(item.description !== undefined && {
              description: item.description,
            }),
            ...(item.url !== undefined && { url: item.url }),
          })),
        },
      }),
  };
}

export function buildPageIdentityGraphSchemas(opts: {
  siteName: string;
  siteUrl: string;
  pageUrl: string;
  pageName: string;
  pageDescription: string;
  breadcrumbs: BreadcrumbItemInput[];
  author?: PersonSchemaOpts;
  logo?: string;
  sameAs?: string[];
  contactEmail?: string;
  areaServed?: string[] | string;
  searchPathTemplate?: string;
}): JsonLdSchema[] {
  const siteUrl = opts.siteUrl.replace(/\/$/, "");
  const pageUrl = opts.pageUrl.endsWith("/")
    ? opts.pageUrl
    : `${opts.pageUrl}/`;
  const organizationId = `${siteUrl}/#organization`;
  const websiteId = `${siteUrl}/#website`;
  const webpageId = `${pageUrl}#webpage`;
  const breadcrumbId = `${pageUrl}#breadcrumb`;

  const organization = {
    ...buildOrganizationSchema({
      name: opts.siteName,
      url: siteUrl,
      founder: opts.author,
      sameAs: opts.sameAs,
      contactPoint: opts.contactEmail
        ? { type: "customer support", email: opts.contactEmail }
        : undefined,
      areaServed: opts.areaServed,
      logo: opts.logo ? joinUrl(siteUrl, opts.logo) : undefined,
    }),
    "@id": organizationId,
  };

  const website = {
    ...buildWebSiteSchema({
      name: opts.siteName,
      url: siteUrl,
      publisherId: organizationId,
      searchAction: opts.searchPathTemplate
        ? { siteUrl, searchPathTemplate: opts.searchPathTemplate }
        : undefined,
    }),
    "@id": websiteId,
  };

  const webpage: JsonLdSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": webpageId,
    url: pageUrl,
    name: opts.pageName,
    description: opts.pageDescription,
    isPartOf: { "@id": websiteId },
    publisher: { "@id": organizationId },
    breadcrumb: { "@id": breadcrumbId },
  };

  const breadcrumb = {
    ...buildBreadcrumbSchema(opts.breadcrumbs, siteUrl),
    "@id": breadcrumbId,
  };

  return [organization, website, webpage, breadcrumb];
}
