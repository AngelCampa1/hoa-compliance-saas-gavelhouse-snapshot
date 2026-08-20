import { useEffect, useState, useCallback } from "react";
import type { ComponentProps } from "react";
import { clsx } from "clsx";
import type { LeadMagnetSlug } from "@boardstack/shared";
import type { ResolvedLeadMagnetOffer } from "../lib/types";
import { EMAIL_REGEX } from "../lib/email-validation";
import { reportUserFacingError } from "../lib/sentry-client";
import { trackEvent } from "../lib/analytics";
import {
  readPosthogDistinctId,
  subscribeToLeadMagnet,
} from "../lib/lead-magnet-subscribe";
import { TurnstileWidget } from "./turnstile-widget";

type SubmitStatus =
  | "idle"
  | "loading"
  | "success"
  | "error-validation"
  | "error-duplicate"
  | "error-generic";

type FormSubmitEvent = Parameters<
  NonNullable<ComponentProps<"form">["onSubmit"]>
>[0];

interface LeadMagnetCaptureProps {
  apiUrl: string;
  offer: ResolvedLeadMagnetOffer;
  sourcePage: string;
  placement: "inline" | "footer";
  privacyNote?: string;
  secondaryCtaText?: string;
  secondaryCtaTarget?: string;
  className?: string;
}

export function LeadMagnetCapture({
  apiUrl,
  offer,
  sourcePage,
  placement,
  privacyNote = "We'll email it to you. No spam. Opt out anytime.",
  secondaryCtaText = "See Pricing",
  secondaryCtaTarget = "/pricing/",
  className,
}: LeadMagnetCaptureProps) {
  if (!apiUrl) {
    throw new Error(
      "PUBLIC_API_URL is required for lead magnet capture components.",
    );
  }

  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>(
    undefined,
  );
  const handleTurnstileVerify = useCallback((token: string | undefined) => {
    setTurnstileToken(token);
  }, []);
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [genericErrorMessage, setGenericErrorMessage] = useState(
    "Something went wrong. Please try again.",
  );

  useEffect(() => {
    trackEvent("lead_magnet_impression", {
      magnet_slug: offer.slug,
      placement,
      source_page: sourcePage,
    });
  }, [offer.slug, placement, sourcePage]);

  const isError =
    status === "error-validation" ||
    status === "error-duplicate" ||
    status === "error-generic";
  const isTurnstilePending =
    Boolean(import.meta.env.PUBLIC_TURNSTILE_SITE_KEY) && !turnstileToken;
  const isSubmitDisabled = status === "loading" || isTurnstilePending;

  const errorMessage =
    status === "error-validation"
      ? "Please enter a valid email address."
      : status === "error-duplicate"
        ? "You're already subscribed. Use the direct download below."
        : status === "error-generic"
          ? genericErrorMessage
          : "";

  async function handleSubmit(event: FormSubmitEvent) {
    event.preventDefault();

    if (!EMAIL_REGEX.test(email)) {
      trackEvent("form_submission_failed", {
        form_name: "lead_magnet_capture",
        magnet_slug: offer.slug,
        placement,
        source_page: sourcePage,
        failure_type: "validation",
      });
      setStatus("error-validation");
      return;
    }

    setStatus("loading");
    trackEvent("lead_magnet_submitted", {
      magnet_slug: offer.slug,
      placement,
      source_page: sourcePage,
    });

    try {
      const result = await subscribeToLeadMagnet({
        apiUrl,
        email,
        magnetSlug: offer.slug as LeadMagnetSlug,
        sourcePage,
        posthogDistinctId: readPosthogDistinctId(),
        companyWebsite: honeypot || undefined,
        turnstileToken,
      });

      setSubmittedEmail(email);
      setDownloadUrl(result.downloadUrl);
      setStatus("success");

      trackEvent("lead_magnet_download_ready", {
        magnet_slug: offer.slug,
        placement,
        source_page: sourcePage,
        already_subscribed: result.alreadySubscribed,
      });
    } catch (error) {
      const statusCode =
        error && typeof error === "object" && "status" in error
          ? Number((error as { status: unknown }).status)
          : undefined;

      if (statusCode === 409) {
        setStatus("error-duplicate");
      } else if (statusCode === 400) {
        trackEvent("form_submission_failed", {
          form_name: "lead_magnet_capture",
          magnet_slug: offer.slug,
          placement,
          source_page: sourcePage,
          failure_type: "validation",
          status_code: statusCode,
        });
        setStatus("error-validation");
      } else {
        trackEvent("form_submission_failed", {
          form_name: "lead_magnet_capture",
          magnet_slug: offer.slug,
          placement,
          source_page: sourcePage,
          failure_type: statusCode ? "http_error" : "network_error",
          ...(statusCode ? { status_code: statusCode } : {}),
        });
        setGenericErrorMessage(
          reportUserFacingError(
            error,
            "Something went wrong. Please try again.",
            {
              tags: { source: "lead-magnet-capture" },
              extra: { magnetSlug: offer.slug, placement, sourcePage },
            },
          ),
        );
        setStatus("error-generic");
      }
    }
  }

  return (
    <div
      className={clsx(
        "rounded-[var(--radius-lg)] border border-[var(--color-neutral-200)] bg-[var(--surface-sunken)] p-5 sm:p-6",
        className,
      )}
      data-lead-magnet-capture
      data-placement={placement}
    >
      {status === "success" ? (
        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <h3 className="font-heading text-[length:var(--text-subheading)] font-bold text-[var(--color-brand-text)]">
              Check your inbox
            </h3>
            <p className="text-[length:var(--text-caption)] leading-6 text-[var(--color-brand-muted)]">
              We sent {offer.title} to{" "}
              <span data-ph-mask>{submittedEmail}</span>. It&apos;s also ready
              as a direct download now.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            {downloadUrl ? (
              <a
                href={downloadUrl}
                target="_blank"
                rel="noopener"
                className="btn-primary btn-shimmer inline-flex items-center justify-center"
              >
                Download now
              </a>
            ) : null}
            <a
              href={secondaryCtaTarget}
              className="btn-secondary inline-flex items-center justify-center"
              onClick={() =>
                trackEvent("lead_magnet_secondary_trial_click", {
                  magnet_slug: offer.slug,
                  placement,
                  source_page: sourcePage,
                  target: secondaryCtaTarget,
                })
              }
            >
              {secondaryCtaText}
            </a>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="editorial-kicker">Free download</p>
            <h3 className="font-heading text-[length:var(--text-subheading)] font-bold text-[var(--color-brand-text)]">
              {offer.title}
            </h3>
            <p className="text-[length:var(--text-caption)] leading-6 text-[var(--color-brand-muted)]">
              {offer.description}
            </p>
          </div>
          <form className="space-y-3" onSubmit={handleSubmit}>
            {/* Honeypot: hidden from real users, traps bots */}
            <input
              type="text"
              name="company_website"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "-9999px",
                width: "1px",
                height: "1px",
                overflow: "hidden",
                opacity: 0,
              }}
            />
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (status.startsWith("error")) {
                    setStatus("idle");
                  }
                }}
                placeholder="you@company.com"
                aria-label="Email address"
                className={clsx(
                  "min-h-12 flex-1 rounded-[var(--radius-md)] border bg-[var(--surface-primary)] px-4 py-3",
                  isError
                    ? "border-[var(--color-error-500)]"
                    : "border-[var(--color-neutral-300)]",
                )}
                style={{ fontSize: "16px" }}
                disabled={isSubmitDisabled}
              />
              <button
                type="submit"
                disabled={isSubmitDisabled}
                className={clsx(
                  "btn-primary btn-shimmer inline-flex min-h-12 items-center justify-center whitespace-nowrap",
                  status === "loading" && "cursor-wait",
                )}
              >
                {status === "loading" ? "Sending..." : offer.ctaText}
              </button>
            </div>
            <TurnstileWidget onVerify={handleTurnstileVerify} />
            <p
              aria-live="polite"
              className={clsx(
                "text-[length:var(--text-caption)]",
                isError ? "text-[var(--color-error-500)]" : "sr-only",
              )}
            >
              {errorMessage}
            </p>
          </form>
          <p className="text-[length:var(--text-caption)] text-[var(--color-brand-muted)]">
            {privacyNote}
          </p>
        </div>
      )}
    </div>
  );
}
