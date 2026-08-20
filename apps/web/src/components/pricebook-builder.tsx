import { useState, Fragment } from "react";
import type { ComponentProps } from "react";
import { clsx } from "clsx";
import type { PricedTask } from "../lib/pricebook-data";
import { generatePricebook } from "../lib/pricebook-data";
import { EMAIL_REGEX } from "../lib/email-validation";
import { trackEvent } from "../lib/analytics";
import {
  captureHttpError,
  formatUserError,
  reportUserFacingError,
} from "../lib/sentry-client";

interface TradeOption {
  value: string;
  label: string;
}

interface PricebookBuilderCopy {
  downloadSuccess?: string;
  trialPrompt?: string;
  trialCtaText?: string;
  downloadCtaText?: string;
  downloadLabel?: string;
  loadingText?: string;
  repairsPricedLabel?: string;
}

interface PricebookBuilderProps {
  apiUrl: string;
  productName: string;
  trialUrl: string;
  trades: TradeOption[];
  copy?: PricebookBuilderCopy;
}

type FormSubmitEvent = Parameters<
  NonNullable<ComponentProps<"form">["onSubmit"]>
>[0];

type DownloadStatus = "idle" | "loading" | "success" | "error";

const DEFAULT_COPY: Required<PricebookBuilderCopy> = {
  downloadSuccess: "Your pricebook is on the way. Check your inbox.",
  trialPrompt: "Ready to use this in {productName}? Keep it close at hand.",
  trialCtaText: "Start trial",
  downloadCtaText: "Get the PDF",
  downloadLabel: "Your email. We'll send the PDF.",
  loadingText: "Sending...",
  repairsPricedLabel: "{count} repairs priced",
};

function formatPrice(price: number): string {
  return `$${price}`;
}

function groupByCategory(tasks: PricedTask[]): Map<string, PricedTask[]> {
  const groups = new Map<string, PricedTask[]>();
  for (const pt of tasks) {
    const cat = pt.task.category;
    const existing = groups.get(cat);
    if (existing) {
      existing.push(pt);
    } else {
      groups.set(cat, [pt]);
    }
  }
  return groups;
}

export function PricebookBuilder({
  apiUrl,
  productName,
  trialUrl,
  trades,
  copy: copyOverrides,
}: PricebookBuilderProps) {
  const resolvedCopy = { ...DEFAULT_COPY, ...copyOverrides };

  const [trade, setTrade] = useState(trades[0]?.value ?? "");
  const [laborRate, setLaborRate] = useState(120);
  const [partsMarkup, setPartsMarkup] = useState(3.0);
  const [afterHoursMultiplier, setAfterHoursMultiplier] = useState(1.5);
  const [downloadEmail, setDownloadEmail] = useState("");
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>("idle");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [downloadErrorMessage, setDownloadErrorMessage] = useState(
    "Something went wrong. Try again.",
  );

  const pricebook = generatePricebook({
    trade,
    laborRate,
    partsMarkup,
    afterHoursMultiplier,
  });

  const grouped = groupByCategory(pricebook.tasks);

  function handleTradeChange(newTrade: string) {
    setTrade(newTrade);
    trackEvent("pricebook_builder_inputs_changed", {
      trade: newTrade,
      labor_rate: laborRate,
      parts_markup: partsMarkup,
    });
  }

  function handleLaborRateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Number(e.target.value);
    setLaborRate(val);
    trackEvent("pricebook_builder_inputs_changed", {
      trade,
      labor_rate: val,
      parts_markup: partsMarkup,
    });
  }

  function handlePartsMarkupChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Number(e.target.value);
    setPartsMarkup(val);
    trackEvent("pricebook_builder_inputs_changed", {
      trade,
      labor_rate: laborRate,
      parts_markup: val,
    });
  }

  function handleAfterHoursChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Number(e.target.value);
    setAfterHoursMultiplier(val);
    trackEvent("pricebook_builder_inputs_changed", {
      trade,
      labor_rate: laborRate,
      parts_markup: partsMarkup,
    });
  }

  function handleEmailChange(e: React.ChangeEvent<HTMLInputElement>) {
    setDownloadEmail(e.target.value);
    if (emailError) {
      setEmailError(null);
    }
  }

  async function handleDownloadSubmit(e: FormSubmitEvent) {
    e.preventDefault();

    if (!EMAIL_REGEX.test(downloadEmail)) {
      setEmailError("Enter a valid email address");
      return;
    }

    setDownloadStatus("loading");

    try {
      const res = await fetch(`${apiUrl}/waitlist/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: downloadEmail,
          sourcePage: "pricebook-builder",
        }),
      });

      if (res.ok) {
        trackEvent("pricebook_pdf_requested", {
          trade,
          email_provided: true,
        });
        setDownloadStatus("success");
      } else {
        const eventId = captureHttpError(res.status, {
          tags: { source: "pricebook-builder-download" },
          extra: { trade },
        });
        setDownloadErrorMessage(
          formatUserError("Something went wrong. Try again.", eventId),
        );
        setDownloadStatus("error");
      }
    } catch (err) {
      setDownloadErrorMessage(
        reportUserFacingError(err, "Something went wrong. Try again.", {
          tags: { source: "pricebook-builder-download" },
          extra: { trade },
        }),
      );
      setDownloadStatus("error");
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--component-gap-lg, 2rem)",
      }}
    >
      {/* Controls */}
      <section
        style={{
          background: "var(--surface-sunken)",
          borderRadius: "var(--radius-md)",
          padding: "var(--spacing-6, 1.5rem)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--component-gap-md, 1.25rem)",
        }}
      >
        {/* Trade selector */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
        >
          <span
            className="font-medium text-[var(--color-brand-text)]"
            style={{ fontSize: "var(--text-caption)" }}
          >
            Trade
          </span>
          <div
            style={{
              display: "flex",
              gap: "var(--component-gap-sm, 0.75rem)",
              flexWrap: "wrap",
            }}
          >
            {trades.map((tradeOption) => (
              <button
                key={tradeOption.value}
                type="button"
                onClick={() => handleTradeChange(tradeOption.value)}
                className={clsx(
                  "min-h-11 px-4 py-2 rounded-full border font-medium transition-colors",
                  trade === tradeOption.value
                    ? "bg-[var(--color-brand-primary)] text-[var(--surface-primary)] border-[var(--color-brand-primary)]"
                    : "bg-transparent text-[var(--color-brand-text)] border-[var(--color-neutral-300)] hover:border-[var(--color-brand-primary)]",
                )}
                style={{ fontSize: "var(--text-body)" }}
              >
                {tradeOption.label}
              </button>
            ))}
          </div>
        </div>

        {/* Labor rate */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
        >
          <label
            htmlFor="labor-rate"
            className="font-medium text-[var(--color-brand-text)]"
            style={{ fontSize: "var(--text-caption)" }}
          >
            Your billable rate ($/hr)
          </label>
          <input
            id="labor-rate"
            type="number"
            min={50}
            max={250}
            step={5}
            value={laborRate}
            onChange={handleLaborRateChange}
            className="min-h-11 px-4 py-2 rounded-[var(--radius-md)] border border-[var(--color-neutral-300)] bg-[var(--surface-primary)] focus:outline-none focus:border-[var(--color-brand-primary)]"
            style={{
              fontSize: "16px",
              maxWidth: "160px",
              width: "100%",
            }}
          />
        </div>

        {/* Parts markup */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
        >
          <label
            htmlFor="parts-markup"
            className="font-medium text-[var(--color-brand-text)]"
            style={{ fontSize: "var(--text-caption)" }}
          >
            Parts markup
          </label>
          <input
            id="parts-markup"
            type="number"
            min={1.5}
            max={5.0}
            step={0.25}
            value={partsMarkup}
            onChange={handlePartsMarkupChange}
            className="min-h-11 px-4 py-2 rounded-[var(--radius-md)] border border-[var(--color-neutral-300)] bg-[var(--surface-primary)] focus:outline-none focus:border-[var(--color-brand-primary)]"
            style={{
              fontSize: "16px",
              maxWidth: "160px",
              width: "100%",
            }}
          />
        </div>

        {/* After-hours multiplier */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
        >
          <label
            htmlFor="after-hours-multiplier"
            className="font-medium text-[var(--color-brand-text)]"
            style={{ fontSize: "var(--text-caption)" }}
          >
            After-hours multiplier
          </label>
          <input
            id="after-hours-multiplier"
            type="number"
            min={1.0}
            max={2.5}
            step={0.25}
            value={afterHoursMultiplier}
            onChange={handleAfterHoursChange}
            className="min-h-11 px-4 py-2 rounded-[var(--radius-md)] border border-[var(--color-neutral-300)] bg-[var(--surface-primary)] focus:outline-none focus:border-[var(--color-brand-primary)]"
            style={{
              fontSize: "16px",
              maxWidth: "160px",
              width: "100%",
            }}
          />
        </div>
      </section>

      {/* Results table */}
      <section>
        <p
          className="text-[var(--color-brand-muted)] mb-4"
          style={{ fontSize: "var(--text-caption)" }}
        >
          {resolvedCopy.repairsPricedLabel.replace(
            "{count}",
            String(pricebook.tasks.length),
          )}
        </p>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse" }}
            aria-label="Pricebook"
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
                  Repair
                </th>
                <th
                  className="text-right font-semibold text-[var(--color-brand-text)]"
                  style={{
                    fontSize: "var(--text-caption)",
                    padding: "0.5rem 0.75rem",
                  }}
                >
                  Standard
                </th>
                <th
                  className="text-right font-semibold text-[var(--color-brand-text)]"
                  style={{
                    fontSize: "var(--text-caption)",
                    padding: "0.5rem 0 0.5rem 0.75rem",
                  }}
                >
                  After-Hours
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from(grouped.entries()).map(([category, tasks]) => (
                <Fragment key={category}>
                  <tr>
                    <td
                      colSpan={3}
                      className="font-semibold text-[var(--color-brand-primary)]"
                      style={{
                        fontSize: "var(--text-caption)",
                        padding: "1rem 0 0.25rem 0",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {category}
                    </td>
                  </tr>
                  {tasks.map((pt) => (
                    <tr
                      key={pt.task.id}
                      style={{
                        borderBottom: "1px solid var(--color-neutral-100)",
                      }}
                    >
                      <td
                        className="text-[var(--color-brand-text)]"
                        style={{
                          fontSize: "var(--text-body)",
                          padding: "0.5rem 0.75rem 0.5rem 0",
                        }}
                      >
                        {pt.task.name}
                      </td>
                      <td
                        className="text-right font-mono text-[var(--color-brand-text)]"
                        style={{
                          fontSize: "var(--text-body)",
                          padding: "0.5rem 0.75rem",
                        }}
                      >
                        {formatPrice(pt.standardPrice)}
                      </td>
                      <td
                        className="text-right font-mono text-[var(--color-brand-muted)]"
                        style={{
                          fontSize: "var(--text-body)",
                          padding: "0.5rem 0 0.5rem 0.75rem",
                        }}
                      >
                        {formatPrice(pt.afterHoursPrice)}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* PDF download gate */}
      <section
        style={{
          background: "var(--surface-sunken)",
          borderRadius: "var(--radius-md)",
          padding: "var(--spacing-6, 1.5rem)",
        }}
      >
        {downloadStatus === "success" ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--component-gap-md, 1.25rem)",
            }}
          >
            <p
              className="font-semibold text-[var(--color-brand-text)]"
              style={{ fontSize: "var(--text-body)" }}
            >
              {resolvedCopy.downloadSuccess}
            </p>
            <p
              className="text-[var(--color-brand-muted)]"
              style={{ fontSize: "var(--text-body)" }}
            >
              {resolvedCopy.trialPrompt.replace("{productName}", productName)}
            </p>
            <a
              href={trialUrl}
              className="btn-primary inline-flex items-center gap-2 self-start"
            >
              {resolvedCopy.trialCtaText}
            </a>
          </div>
        ) : (
          <form
            onSubmit={handleDownloadSubmit}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--component-gap-sm, 0.75rem)",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              <label
                htmlFor="pricebook-email"
                className="font-medium text-[var(--color-brand-text)]"
                style={{ fontSize: "var(--text-caption)" }}
              >
                {resolvedCopy.downloadLabel}
              </label>
              <input
                id="pricebook-email"
                type="email"
                required
                autoComplete="email"
                value={downloadEmail}
                onChange={handleEmailChange}
                placeholder="you@company.com"
                disabled={downloadStatus === "loading"}
                className={clsx(
                  "w-full min-h-11 px-4 py-3 rounded-[var(--radius-md)] border",
                  "bg-[var(--surface-primary)]",
                  "focus:outline-none focus:border-[var(--color-brand-primary)]",
                  emailError
                    ? "border-[var(--color-error-500)]"
                    : "border-[var(--color-neutral-300)]",
                )}
                style={{ fontSize: "16px", maxWidth: "400px" }}
              />
              {emailError ? (
                <p
                  className="text-[var(--color-error-500)]"
                  style={{ fontSize: "var(--text-caption)" }}
                  role="alert"
                >
                  {emailError}
                </p>
              ) : null}
              {downloadStatus === "error" ? (
                <p
                  className="text-[var(--color-error-500)]"
                  style={{ fontSize: "var(--text-caption)" }}
                  role="alert"
                >
                  {downloadErrorMessage}
                </p>
              ) : null}
            </div>
            <button
              type="submit"
              disabled={downloadStatus === "loading"}
              className={clsx(
                "btn-primary",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                downloadStatus === "loading" && "cursor-wait",
              )}
              style={{ alignSelf: "flex-start" }}
            >
              {downloadStatus === "loading"
                ? resolvedCopy.loadingText
                : resolvedCopy.downloadCtaText}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
