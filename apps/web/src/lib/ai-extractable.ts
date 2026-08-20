import type {
  AnswerBlockOpts,
  ExpertQuoteOpts,
  ProsConsOpts,
  ProsConsReviewOpts,
  ComparisonTableOpts,
  DataTableOpts,
  JsonLdSchema,
} from "./schema-types";

export function buildAnswerSchema(opts: AnswerBlockOpts): JsonLdSchema {
  return {
    "@context": "https://schema.org",
    "@type": "Question",
    name: opts.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: opts.answer,
    },
  };
}

export function validateAnswerLength(text: string): {
  valid: boolean;
  wordCount: number;
} {
  const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
  const valid = wordCount >= 40 && wordCount <= 60;
  return { valid, wordCount };
}

export function buildExpertQuoteSchema(opts: ExpertQuoteOpts): JsonLdSchema {
  const { quote, person } = opts;

  const creator: Record<string, unknown> = {
    "@type": "Person",
    name: person.name,
    ...(person.jobTitle !== undefined && { jobTitle: person.jobTitle }),
    ...(person.organization !== undefined && {
      worksFor: { "@type": "Organization", name: person.organization },
    }),
    ...(person.url !== undefined && { url: person.url }),
    ...(person.sameAs !== undefined && { sameAs: person.sameAs }),
  };

  return {
    "@context": "https://schema.org",
    "@type": "Quotation",
    text: quote,
    creator,
  };
}

/**
 * Emits an ItemList schema for pros/cons. Kept as an internal utility for
 * callers that need plain ItemList output. For Google's Pros/Cons rich result,
 * use `buildProsConsReviewSchema` instead.
 */
export function buildProsConsSchema(opts: ProsConsOpts): JsonLdSchema {
  const items = [
    ...opts.pros.map((text, i) => ({
      "@type": "ListItem" as const,
      position: i + 1,
      name: text,
      description: "Pro",
    })),
    ...opts.cons.map((text, i) => ({
      "@type": "ListItem" as const,
      position: opts.pros.length + i + 1,
      name: text,
      description: "Con",
    })),
  ];

  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Pros and cons of ${opts.subject}`,
    itemListElement: items,
  };
}

export function buildProsConsData(opts: ProsConsOpts): {
  subject: string;
  positiveNotes: string[];
  negativeNotes: string[];
} {
  return {
    subject: opts.subject,
    positiveNotes: opts.pros,
    negativeNotes: opts.cons,
  };
}

/**
 * Extracts a numeric string from a statistic value for use in <data value="...">.
 * Example: "2,100 establishments" → "2100", "42%" → "42", "$149/mo" → "149"
 *
 * Note: magnitude suffixes are truncated -- "1.5M" becomes "1.5", not "1500000".
 * The <data> element value is intended for machine consumption of the raw numeric
 * portion; full magnitude interpretation is left to the consumer.
 */
export function parseStatValue(stat: string): string {
  const digitsAndDots = stat.replace(/[^0-9.]/g, "");
  const firstDot = digitsAndDots.indexOf(".");
  const stripped =
    firstDot === -1
      ? digitsAndDots
      : digitsAndDots.slice(0, firstDot + 1) +
        digitsAndDots.slice(firstDot + 1).replace(/\./g, "");
  return stripped || stat; // fall back to raw string if no digits found
}

export function buildTableSchema(opts: DataTableOpts): JsonLdSchema {
  const { name, description, columns, rows } = opts;
  const tableData = rows.map((row) =>
    Object.fromEntries(
      columns.map((column, index) => [column, row[index] ?? ""]),
    ),
  );

  return {
    "@context": "https://schema.org",
    "@type": "Table",
    name,
    ...(description !== undefined && { description }),
    ...(columns.length > 0 && { variableMeasured: columns }),
    ...(columns.length > 0 &&
      rows.length > 0 && {
        hasPart: [
          {
            "@type": "Dataset",
            name: `${name} table data`,
            variableMeasured: columns,
            encoding: {
              "@type": "MediaObject",
              encodingFormat: "application/json",
              text: JSON.stringify(tableData),
            },
          },
        ],
      }),
  };
}

/**
 * Leaner companion to `buildTableSchema` for comparison tables rendered by
 * `comparison-table.astro`. `ComparisonTableOpts` omits `columns`/`rows`
 * because `comparison-table.astro` renders its own HTML table independently
 * and does not pass column/row data into the schema builder. By contrast,
 * `buildTableSchema` serves `data-table-block`, which carries full
 * column+row data as props. The two builders coexist because their callers
 * have different data shapes -- keeping them separate avoids a leaky
 * abstraction where one builder silently ignores required fields of the other.
 */
export function buildComparisonTableSchema(
  opts: ComparisonTableOpts,
): JsonLdSchema {
  return buildTableSchema({
    name: opts.name,
    description: opts.description,
    columns: [],
    rows: [],
  });
}

export function buildProsConsReviewSchema(
  opts: ProsConsReviewOpts,
): JsonLdSchema {
  const {
    subject,
    pros,
    cons,
    reviewer,
    reviewerName = "Editorial Team",
  } = opts;

  return {
    "@context": "https://schema.org",
    "@type": "Review",
    itemReviewed: {
      "@type": "SoftwareApplication",
      name: subject,
    },
    author: reviewer
      ? {
          "@type": "Person",
          name: reviewer.name,
          ...(reviewer.url && { url: reviewer.url }),
          ...(reviewer.jobTitle && { jobTitle: reviewer.jobTitle }),
          ...(reviewer.sameAs && { sameAs: reviewer.sameAs }),
          ...(reviewer.credentials && { hasCredential: reviewer.credentials }),
        }
      : {
          "@type": "Organization",
          name: reviewerName,
        },
    positiveNotes: {
      "@type": "ItemList",
      itemListElement: pros.map((text, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: text,
      })),
    },
    negativeNotes: {
      "@type": "ItemList",
      itemListElement: cons.map((text, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: text,
      })),
    },
  };
}
