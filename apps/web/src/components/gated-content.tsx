import { useState, useCallback } from "react";
import type { ComponentProps } from "react";
import { clsx } from "clsx";
import { type LeadMagnetSlug } from "@boardstack/shared";
import { isSignedUp, setSignedUp } from "../lib/exit-popup-utils";
import { EMAIL_REGEX } from "../lib/email-validation";
import { trackEvent } from "../lib/analytics";
import { captureException } from "../lib/sentry-client";
import { sanitizeHtml } from "../lib/sanitize";
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
  | "error-retry"
  | "error-generic";

type FormSubmitEvent = Parameters<
  NonNullable<ComponentProps<"form">["onSubmit"]>
>[0];

interface GatedContentProps {
  apiUrl: string;
  leadMagnetTitle: string;
  magnetSlug: LeadMagnetSlug;
  description: string;
  ctaText: string;
  teaserHtml: string;
  gatedHtml: string;
  privacyNote?: string;
  sourcePage?: string;
}

export function GatedContent({
  apiUrl,
  leadMagnetTitle,
  magnetSlug,
  description,
  ctaText,
  teaserHtml,
  gatedHtml,
  privacyNote = "We'll email it to you. No spam. Opt out anytime.",
  sourcePage,
}: GatedContentProps) {
  const [unlocked, setUnlocked] = useState(() => isSignedUp());
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
  const [submittedEmail, setSubmittedEmail] = useState<string>("");

  const isError =
    status === "error-validation" ||
    status === "error-retry" ||
    status === "error-generic";
  const isTurnstilePending =
    Boolean(import.meta.env.PUBLIC_TURNSTILE_SITE_KEY) && !turnstileToken;
  const isSubmitDisabled = status === "loading" || isTurnstilePending;

  const errorMessage =
    status === "error-validation"
      ? "Please enter a valid email address."
      : status === "error-retry"
        ? "We're having trouble right now. Please try again in a moment."
        : status === "error-generic"
          ? "Something went wrong. Please try again."
          : "";

  async function handleSubmit(e: FormSubmitEvent) {
    e.preventDefault();

    if (!EMAIL_REGEX.test(email)) {
      trackEvent("form_submission_failed", {
        form_name: "gated_content",
        magnet_slug: magnetSlug,
        source_page: sourcePage ?? "lead-magnet",
        failure_type: "validation",
      });
      setStatus("error-validation");
      return;
    }

    setStatus("loading");

    try {
      const { downloadUrl: url, alreadySubscribed } =
        await subscribeToLeadMagnet({
          apiUrl,
          email,
          magnetSlug,
          sourcePage: sourcePage ?? "lead-magnet",
          posthogDistinctId: readPosthogDistinctId(),
          companyWebsite: honeypot || undefined,
          turnstileToken,
        });

      setSubmittedEmail(email);
      setDownloadUrl(url);
      setSignedUp();
      setUnlocked(true);
      setStatus("success");

      trackEvent("lead_magnet_unlocked", {
        title: leadMagnetTitle,
        magnet_slug: magnetSlug,
        source_page: sourcePage ?? "lead-magnet",
      });
      if (!alreadySubscribed) {
        trackEvent("waitlist_submitted", {
          source: "gated_content",
          source_page: sourcePage ?? "lead-magnet",
        });
      }
    } catch (err) {
      const statusCode =
        err && typeof err === "object" && "status" in err
          ? Number((err as { status: unknown }).status)
          : undefined;

      if (statusCode === 400) {
        trackEvent("form_submission_failed", {
          form_name: "gated_content",
          magnet_slug: magnetSlug,
          source_page: sourcePage ?? "lead-magnet",
          failure_type: "validation",
          status_code: statusCode,
        });
        setStatus("error-validation");
      } else if (statusCode && statusCode >= 500) {
        trackEvent("form_submission_failed", {
          form_name: "gated_content",
          magnet_slug: magnetSlug,
          source_page: sourcePage ?? "lead-magnet",
          failure_type: "http_error",
          status_code: statusCode,
        });
        setStatus("error-retry");
      } else {
        trackEvent("form_submission_failed", {
          form_name: "gated_content",
          magnet_slug: magnetSlug,
          source_page: sourcePage ?? "lead-magnet",
          failure_type: statusCode ? "http_error" : "network_error",
          ...(statusCode ? { status_code: statusCode } : {}),
        });
        captureException(err);
        setStatus("error-generic");
      }
    }
  }

  if (unlocked) {
    return (
      <div>
        {downloadUrl && (
          <div
            className="mb-8 rounded-[var(--radius-lg,12px)] border border-[var(--color-neutral-200)] p-6 sm:p-8 text-center"
            style={{ background: "var(--surface-sunken)" }}
          >
            <h3
              className="font-heading font-bold mb-2"
              style={{
                fontSize: "var(--text-heading, 1.25rem)",
                color: "var(--color-brand-text)",
              }}
            >
              Check your inbox
            </h3>
            <p
              className="mb-6"
              style={{
                fontSize: "var(--text-caption, 0.875rem)",
                color: "var(--color-brand-muted)",
              }}
            >
              We sent your {leadMagnetTitle} to{" "}
              <span data-ph-mask>{submittedEmail}</span>. It's also available to
              download below.
            </p>
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener"
              className="btn-primary inline-block px-6"
            >
              Download now
            </a>
          </div>
        )}
        <div className="prose prose-lg max-w-none">
          <div
            dangerouslySetInnerHTML={{
              __html: sanitizeHtml(teaserHtml + gatedHtml),
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Teaser content */}
      <div
        className="prose prose-lg max-w-none"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(teaserHtml) }}
      />

      {/* Gate overlay with gradient fade */}
      <div className="lead-magnet-gate relative">
        {/* Gradient fade effect */}
        <div
          className="pointer-events-none h-24 -mt-24 relative z-10"
          style={{
            background:
              "linear-gradient(to bottom, transparent, var(--surface-sunken))",
          }}
        />

        {/* Email gate form */}
        <div
          className="relative z-20 rounded-[var(--radius-lg,12px)] border border-[var(--color-neutral-200)] p-6 sm:p-8 text-center"
          style={{ background: "var(--surface-sunken)" }}
        >
          <h3
            className="font-heading font-bold mb-2"
            style={{
              fontSize: "var(--text-heading, 1.25rem)",
              color: "var(--color-brand-text)",
            }}
          >
            {leadMagnetTitle}
          </h3>
          <p
            className="mb-6"
            style={{
              fontSize: "var(--text-caption, 0.875rem)",
              color: "var(--color-brand-muted)",
            }}
          >
            {description}
          </p>

          <form
            onSubmit={handleSubmit}
            className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
          >
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
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (status.startsWith("error")) setStatus("idle");
              }}
              placeholder="you@company.com"
              aria-label="Email address"
              aria-invalid={isError}
              aria-describedby="gated-content-error"
              className={clsx(
                "flex-1 min-h-[44px] px-4 py-2.5 rounded-[var(--radius-md,8px)] border w-full sm:w-auto",
                "bg-[var(--surface-sunken)]",
                "focus:outline-none focus:border-[var(--color-primary-500)] focus:border-2",
                "transition-[border-color] duration-[var(--transition-fast,150ms)]",
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
                "btn-primary btn-shimmer",
                "w-full sm:w-auto whitespace-nowrap px-6",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                status === "loading" && "cursor-wait",
              )}
            >
              {status === "loading" ? "Sending\u2026" : ctaText}
            </button>
          </form>

          <TurnstileWidget onVerify={handleTurnstileVerify} />

          <p
            id="gated-content-error"
            aria-live="polite"
            className={
              isError ? "text-[var(--color-error-500)] mt-2" : "sr-only"
            }
            style={
              isError
                ? { fontSize: "var(--text-caption, 0.875rem)" }
                : undefined
            }
          >
            {isError ? errorMessage : ""}
          </p>

          <p
            className="mt-4"
            style={{
              fontSize: "var(--text-caption, 0.875rem)",
              color: "var(--color-brand-muted)",
            }}
          >
            {privacyNote}
          </p>
        </div>
      </div>
    </div>
  );
}
