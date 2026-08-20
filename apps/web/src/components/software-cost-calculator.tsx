import { useState } from "react";
import { clsx } from "clsx";
import {
  generateComparison,
  type CompetitorPricing,
} from "../lib/competitor-cost-calculator";
import { trackEvent } from "../lib/analytics";

interface SoftwareCostCalculatorProps {
  trialUrl: string;
  /** Which competitor slug to highlight as "our product" */
  productSlug: string;
  /** Subtitle shown under the highlighted product row (e.g. "Flat Rate - No per-tech fees") */
  productSubtitle?: string;
  /** Template for the savings headline. Placeholders: {savings}, {competitor}, {teamSize}, {techLabel} */
  savingsTemplate?: string;
  /** Template for the savings sub-line. Placeholders: {annualSavings} */
  savingsSubTemplate?: string;
  /** CTA button text */
  ctaText?: string;
  /** The competitors to compare */
  competitors: CompetitorPricing[];
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString()}`;
}

export function SoftwareCostCalculator({
  trialUrl,
  productSlug,
  productSubtitle,
  savingsTemplate = "At {teamSize} {techLabel}, {productName} saves you {savings}/mo vs. {competitor}",
  savingsSubTemplate = "That is {annualSavings} saved each year.",
  ctaText = "Start trial",
  competitors,
}: SoftwareCostCalculatorProps) {
  const [teamSize, setTeamSize] = useState(3);

  function handleSliderChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Number(e.target.value);
    setTeamSize(val);
    trackEvent("cost_calculator_team_size_changed", { team_size: val });
  }

  const comparison = generateComparison(teamSize, competitors, productSlug);
  const { results } = comparison;

  // Find the product entry for template rendering
  const productEntry = competitors.find((c) => c.slug === productSlug);
  const productName = productEntry?.name ?? productSlug;

  // Find max positive savings vs product (i.e. most expensive competitor)
  const competitorResults = results.filter(
    (r) => r.competitor.slug !== productSlug,
  );
  const savingsValues = competitorResults.map((r) => r.savingsVsProduct);
  const maxSavings = savingsValues.length > 0 ? Math.max(...savingsValues) : 0;
  const mostExpensive = competitorResults.find(
    (r) => r.savingsVsProduct === maxSavings,
  );
  const showSavings = maxSavings > 0 && mostExpensive !== undefined;

  const techLabel = teamSize !== 1 ? "techs" : "tech";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--component-gap-lg, 2rem)",
      }}
    >
      {/* Slider control */}
      <section
        style={{
          background: "var(--surface-sunken)",
          borderRadius: "var(--radius-md)",
          padding: "var(--spacing-6, 1.5rem)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--component-gap-sm, 0.75rem)",
        }}
      >
        <label
          htmlFor="team-size-slider"
          className="font-medium text-[var(--color-brand-text)]"
          style={{ fontSize: "var(--text-body)" }}
        >
          Team size: {teamSize} tech{teamSize !== 1 ? "s" : ""}
        </label>
        <input
          id="team-size-slider"
          type="range"
          min={1}
          max={15}
          step={1}
          value={teamSize}
          onChange={handleSliderChange}
          style={{
            width: "100%",
            maxWidth: "400px",
            minHeight: "44px",
            touchAction: "pan-y",
          }}
          aria-label={`Team size: ${teamSize} techs`}
        />
        <div
          className="flex justify-between text-[var(--color-brand-muted)]"
          style={{ fontSize: "var(--text-caption)", maxWidth: "400px" }}
        >
          <span>1 tech</span>
          <span>15 techs</span>
        </div>
      </section>

      {/* Comparison table */}
      <section>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse" }}
            aria-label="Software cost comparison"
          >
            <thead>
              <tr
                style={{
                  borderBottom: "2px solid var(--color-neutral-200)",
                }}
              >
                <th
                  className="text-left font-semibold text-[var(--color-brand-text)]"
                  style={{
                    fontSize: "var(--text-caption)",
                    padding: "0.5rem 0.75rem 0.5rem 0",
                  }}
                >
                  Software
                </th>
                <th
                  className="text-right font-semibold text-[var(--color-brand-text)]"
                  style={{
                    fontSize: "var(--text-caption)",
                    padding: "0.5rem 0.75rem",
                  }}
                >
                  Monthly
                </th>
                <th
                  className="text-right font-semibold text-[var(--color-brand-text)]"
                  style={{
                    fontSize: "var(--text-caption)",
                    padding: "0.5rem 0.75rem",
                  }}
                >
                  Annual
                </th>
                <th
                  className="text-right font-semibold text-[var(--color-brand-text)]"
                  style={{
                    fontSize: "var(--text-caption)",
                    padding: "0.5rem 0 0.5rem 0.75rem",
                  }}
                >
                  First Year Total
                </th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => {
                const isProduct = result.competitor.slug === productSlug;
                return (
                  <tr
                    key={result.competitor.slug}
                    aria-label={
                      isProduct
                        ? `${result.competitor.name} - highlighted row`
                        : result.competitor.name
                    }
                    className={clsx(
                      isProduct &&
                        "border-l-4 border-[var(--color-primary-500)]",
                    )}
                    style={{
                      borderBottom: "1px solid var(--color-neutral-100)",
                      ...(isProduct
                        ? {
                            background:
                              "color-mix(in srgb, var(--color-primary-500) 8%, transparent)",
                          }
                        : {}),
                    }}
                  >
                    <td
                      style={{
                        fontSize: "var(--text-body)",
                        padding: "0.625rem 0.75rem 0.625rem 0",
                      }}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span
                          className={clsx(
                            "font-medium",
                            isProduct
                              ? "text-[var(--color-primary-500)] font-semibold"
                              : "text-[var(--color-brand-text)]",
                          )}
                        >
                          {result.competitor.name}
                          {result.isCheapest ? (
                            <span
                              className="ml-2 inline-block text-[var(--color-accent-950)] bg-[var(--color-accent-500)] font-medium rounded-full px-1.5 py-0.5"
                              style={{ fontSize: "var(--text-caption)" }}
                            >
                              Lowest Cost
                            </span>
                          ) : null}
                        </span>
                        {isProduct && productSubtitle ? (
                          <span
                            className="text-[var(--color-brand-muted)]"
                            style={{ fontSize: "var(--text-caption)" }}
                          >
                            {productSubtitle}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td
                      className={clsx(
                        "text-right font-mono",
                        isProduct
                          ? "font-semibold text-[var(--color-primary-500)]"
                          : "text-[var(--color-brand-text)]",
                      )}
                      style={{
                        fontSize: "var(--text-body)",
                        padding: "0.625rem 0.75rem",
                      }}
                    >
                      {formatCurrency(result.monthlyTotal)}/mo
                    </td>
                    <td
                      className="text-right font-mono text-[var(--color-brand-text)]"
                      style={{
                        fontSize: "var(--text-body)",
                        padding: "0.625rem 0.75rem",
                      }}
                    >
                      {formatCurrency(result.annualTotal)}
                    </td>
                    <td
                      className="text-right font-mono text-[var(--color-brand-text)]"
                      style={{
                        fontSize: "var(--text-body)",
                        padding: "0.625rem 0 0.625rem 0.75rem",
                      }}
                    >
                      {formatCurrency(result.firstYearTotal)}
                      {result.competitor.setupFee > 0 ? (
                        <span
                          className="block text-[var(--color-brand-muted)]"
                          style={{ fontSize: "var(--text-caption)" }}
                        >
                          incl. ${result.competitor.setupFee.toLocaleString()}{" "}
                          setup
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Savings callout */}
      {showSavings ? (
        <div
          style={{
            background:
              "color-mix(in srgb, var(--color-primary-500) 10%, transparent)",
            borderRadius: "var(--radius-md)",
            padding: "var(--spacing-4, 1rem) var(--spacing-6, 1.5rem)",
            borderLeft: "4px solid var(--color-primary-500)",
          }}
        >
          <p
            className="font-semibold text-[var(--color-brand-text)]"
            style={{ fontSize: "var(--text-body)" }}
          >
            {savingsTemplate
              .replace("{productName}", productName)
              .replace("{savings}", formatCurrency(maxSavings))
              .replace("{competitor}", mostExpensive!.competitor.name)
              .replace("{teamSize}", String(teamSize))
              .replace("{techLabel}", techLabel)}
          </p>
          <p
            className="text-[var(--color-brand-muted)]"
            style={{ fontSize: "var(--text-caption)", marginTop: "0.25rem" }}
          >
            {savingsSubTemplate.replace(
              "{annualSavings}",
              formatCurrency(maxSavings * 12),
            )}
          </p>
        </div>
      ) : null}

      {/* CTA */}
      <div>
        <a
          href={trialUrl}
          className="btn-primary inline-flex items-center gap-2"
        >
          {ctaText}
        </a>
      </div>
    </div>
  );
}
