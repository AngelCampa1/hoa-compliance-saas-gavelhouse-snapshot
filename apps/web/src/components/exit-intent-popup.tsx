import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { ComponentProps } from "react";
import type { LeadMagnetSlug } from "@boardstack/shared";
import { useFocusTrap } from "../lib/focus-trap";
import { clsx } from "clsx";
import {
  isSignedUp,
  isWithinSuppressWindow,
  setSuppressed,
  setSignedUp,
  detectScrollBack,
  SUPPRESS_DAYS,
} from "../lib/exit-popup-utils";
import { EXIT_POPUP_DEFAULTS } from "../lib/exit-popup-defaults";
import type { LeadMagnet } from "../lib/types";
import { EMAIL_REGEX } from "../lib/email-validation";
import { lockScroll, unlockScroll } from "../lib/scroll-lock";
import { trackEvent } from "../lib/analytics";
import { captureException } from "../lib/sentry-client";
import {
  persistSignupAttribution,
  resolveSignupAttribution,
} from "../lib/signup-attribution";
import {
  readPosthogDistinctId,
  subscribeToLeadMagnet,
} from "../lib/lead-magnet-subscribe";
import { TurnstileWidget } from "./turnstile-widget";
import { TurnstileBoundary } from "./turnstile-boundary";

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

interface ExitIntentPopupProps {
  apiUrl: string;
  siteName: string;
  leadMagnet?: LeadMagnet;
  headline: string;
  description: string;
  ctaText: string;
  leftPanelLabel: string;
  successSubMessage: string;
  showLeadMagnetContent?: boolean;
  declineText?: string;
  privacyNote?: string;
  errorInvalidEmail?: string;
  errorDuplicate?: string;
  errorGeneric?: string;
  successMessage?: string;
  loadingText?: string;
}

export function ExitIntentPopup({
  apiUrl,
  siteName,
  leadMagnet,
  headline,
  description,
  ctaText,
  leftPanelLabel,
  successSubMessage,
  showLeadMagnetContent = true,
  declineText = EXIT_POPUP_DEFAULTS.declineText,
  privacyNote = EXIT_POPUP_DEFAULTS.privacyNote,
  errorInvalidEmail = EXIT_POPUP_DEFAULTS.errorInvalidEmail,
  errorDuplicate = EXIT_POPUP_DEFAULTS.errorDuplicate,
  errorGeneric = EXIT_POPUP_DEFAULTS.errorGeneric,
  successMessage = EXIT_POPUP_DEFAULTS.successMessage,
  loadingText,
}: ExitIntentPopupProps) {
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>(
    undefined,
  );
  const [turnstileUnavailable, setTurnstileUnavailable] = useState(false);
  const handleTurnstileVerify = useMemo(
    () => (token: string | undefined) => {
      setTurnstileToken(token);
    },
    [],
  );
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const triggeredRef = useRef(false);
  const dismissedRef = useRef(false);
  // Tracks whether the shown analytics event has fired within this popup
  // lifecycle. Resets naturally on component unmount/remount if re-show is
  // ever needed; there is no runtime path that resets it while dismissed.
  const shownTrackedRef = useRef(false);
  const peakScrollYRef = useRef(0);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolvedDescription =
    showLeadMagnetContent && leadMagnet?.description
      ? leadMagnet.description
      : description;
  const panelTitle = showLeadMagnetContent
    ? (leadMagnet?.title ?? `${siteName} Guide`)
    : undefined;

  const dismiss = useCallback(() => {
    setSuppressed();
    dismissedRef.current = true;
    triggeredRef.current = false;
    setVisible(false);
    trackEvent("exit_popup_dismissed");
  }, []);

  // Focus email input when popup opens
  useEffect(() => {
    if (visible && emailInputRef.current) {
      emailInputRef.current.focus();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !showLeadMagnetContent || !leadMagnet?.slug) {
      return;
    }

    trackEvent("lead_magnet_impression", {
      magnet_slug: leadMagnet.slug,
      placement: "popup",
      source_page: "exit-popup",
    });
  }, [visible, showLeadMagnetContent, leadMagnet]);

  // Esc key handler - only active when visible
  useEffect(() => {
    if (!visible) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        dismiss();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [visible, dismiss]);

  useFocusTrap(dialogRef, visible);

  // Body scroll lock when visible
  useEffect(() => {
    if (!visible) return;
    lockScroll();
    return () => {
      unlockScroll();
    };
  }, [visible]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Mount: attach exit-intent triggers
  useEffect(() => {
    persistSignupAttribution();

    if (isSignedUp() || isWithinSuppressWindow(SUPPRESS_DAYS)) {
      return;
    }

    const timer = setTimeout(() => {
      triggeredRef.current = true;
    }, 5000);

    function handleMouseLeave(e: MouseEvent) {
      if (triggeredRef.current && !dismissedRef.current && e.clientY < 5) {
        setVisible(true);
        if (!shownTrackedRef.current) {
          shownTrackedRef.current = true;
          trackEvent("exit_popup_shown", { trigger: "mouseleave" });
        }
      }
    }

    document.addEventListener("mouseleave", handleMouseLeave);

    let scrollHandler: (() => void) | null = null;

    if ("ontouchstart" in window) {
      scrollHandler = () => {
        const currentY = window.scrollY;
        if (currentY > peakScrollYRef.current) {
          peakScrollYRef.current = currentY;
        }
        if (
          triggeredRef.current &&
          !dismissedRef.current &&
          detectScrollBack(currentY, peakScrollYRef.current, 300, 200)
        ) {
          setVisible(true);
          if (!shownTrackedRef.current) {
            shownTrackedRef.current = true;
            trackEvent("exit_popup_shown", { trigger: "scroll_back" });
          }
        }
      };
      window.addEventListener("scroll", scrollHandler, { passive: true });
    }

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mouseleave", handleMouseLeave);
      if (scrollHandler) {
        window.removeEventListener("scroll", scrollHandler);
      }
    };
  }, []);

  async function handleSubmit(e: FormSubmitEvent) {
    e.preventDefault();

    if (!EMAIL_REGEX.test(email)) {
      trackEvent("form_submission_failed", {
        form_name: showLeadMagnetContent
          ? "exit_popup_lead_magnet"
          : "exit_popup",
        source_page: "exit-popup",
        failure_type: "validation",
        ...(showLeadMagnetContent && leadMagnet?.slug
          ? { magnet_slug: leadMagnet.slug }
          : {}),
      });
      setStatus("error-validation");
      return;
    }

    setStatus("loading");

    try {
      if (showLeadMagnetContent && leadMagnet?.slug) {
        trackEvent("lead_magnet_submitted", {
          magnet_slug: leadMagnet.slug,
          placement: "popup",
          source_page: "exit-popup",
        });
        const response = await subscribeToLeadMagnet({
          apiUrl,
          email,
          magnetSlug: leadMagnet.slug as LeadMagnetSlug,
          sourcePage: "exit-popup",
          posthogDistinctId: readPosthogDistinctId(),
          companyWebsite: honeypot || undefined,
          turnstileToken,
        });
        setDownloadUrl(response.downloadUrl);
        setSignedUp();
        dismissedRef.current = true;
        setStatus("success");
        trackEvent("exit_popup_converted");
        trackEvent("lead_magnet_download_ready", {
          magnet_slug: leadMagnet.slug,
          placement: "popup",
          source_page: "exit-popup",
          already_subscribed: response.alreadySubscribed,
        });
        timerRef.current = setTimeout(() => {
          setVisible(false);
        }, 4000);
      } else {
        const attribution = resolveSignupAttribution();
        const res = await fetch(`${apiUrl}/waitlist/subscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            sourcePage: "exit-popup",
            utmSource: attribution.utmSource,
            utmMedium: attribution.utmMedium,
            utmCampaign: attribution.utmCampaign,
            referredBy: attribution.referredBy,
            companyWebsite: honeypot || undefined,
            turnstileToken,
          }),
        });

        if (res.ok) {
          setSignedUp();
          dismissedRef.current = true;
          setStatus("success");
          trackEvent("exit_popup_converted");
          trackEvent("waitlist_submitted", {
            source: "exit_popup",
            source_page: "exit-popup",
          });
          timerRef.current = setTimeout(() => {
            setVisible(false);
          }, 2000);
        } else if (res.status === 409) {
          setStatus("error-duplicate");
        } else {
          trackEvent("form_submission_failed", {
            form_name: "exit_popup",
            source_page: "exit-popup",
            failure_type: "http_error",
            status_code: res.status,
          });
          setStatus("error-generic");
        }
      }
    } catch (err) {
      const statusCode =
        err && typeof err === "object" && "status" in err
          ? Number((err as { status: unknown }).status)
          : undefined;

      if (statusCode === 409) {
        setStatus("error-duplicate");
      } else if (statusCode === 400) {
        trackEvent("form_submission_failed", {
          form_name: showLeadMagnetContent
            ? "exit_popup_lead_magnet"
            : "exit_popup",
          source_page: "exit-popup",
          failure_type: "validation",
          status_code: statusCode,
          ...(showLeadMagnetContent && leadMagnet?.slug
            ? { magnet_slug: leadMagnet.slug }
            : {}),
        });
        setStatus("error-validation");
      } else {
        trackEvent("form_submission_failed", {
          form_name: showLeadMagnetContent
            ? "exit_popup_lead_magnet"
            : "exit_popup",
          source_page: "exit-popup",
          failure_type: statusCode ? "http_error" : "network_error",
          ...(statusCode ? { status_code: statusCode } : {}),
          ...(showLeadMagnetContent && leadMagnet?.slug
            ? { magnet_slug: leadMagnet.slug }
            : {}),
        });
        captureException(err);
        setStatus("error-generic");
      }
    }
  }

  if (!visible) {
    return null;
  }

  const isError =
    status === "error-validation" ||
    status === "error-duplicate" ||
    status === "error-generic";
  const isTurnstilePending =
    Boolean(import.meta.env.PUBLIC_TURNSTILE_SITE_KEY) &&
    !turnstileToken &&
    !turnstileUnavailable;
  const isSubmitDisabled = status === "loading" || isTurnstilePending;

  const currentErrorMessage =
    status === "error-validation"
      ? errorInvalidEmail
      : status === "error-duplicate"
        ? errorDuplicate
        : status === "error-generic"
          ? errorGeneric
          : "";

  return (
    <div
      data-backdrop
      onClick={dismiss}
      className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center"
      style={{ background: "var(--exit-popup-overlay-bg)" }}
    >
      {/* Dialog - stop propagation so clicks inside don't dismiss */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-popup-heading"
        onClick={(e) => e.stopPropagation()}
        className="relative flex w-full flex-col overflow-hidden rounded-t-[var(--radius-xl)] shadow-[var(--shadow-ambient)] sm:mx-4 sm:max-w-[540px] sm:flex-row sm:rounded-[var(--radius-lg)]"
        style={{ paddingBottom: "var(--safe-bottom, 0px)" }}
      >
        {/* Left panel (subtle primary tint) */}
        <div className="hidden flex-col items-center justify-center gap-3 border-r border-[var(--color-neutral-200)] bg-[var(--color-primary-50)] p-6 sm:flex sm:w-44 sm:shrink-0">
          {/* Document SVG icon */}
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            fill="none"
            aria-hidden="true"
          >
            <rect
              x="8"
              y="4"
              width="28"
              height="36"
              rx="3"
              style={{ fill: "var(--color-primary-700)" }}
              fillOpacity="0.25"
            />
            <rect
              x="10"
              y="6"
              width="24"
              height="32"
              rx="2"
              style={{ fill: "var(--color-primary-700)" }}
              fillOpacity="0.9"
            />
            <rect
              x="14"
              y="13"
              width="16"
              height="2"
              rx="1"
              fill="var(--color-primary-50)"
            />
            <rect
              x="14"
              y="18"
              width="16"
              height="2"
              rx="1"
              fill="var(--color-primary-50)"
            />
            <rect
              x="14"
              y="23"
              width="10"
              height="2"
              rx="1"
              fill="var(--color-primary-50)"
            />
          </svg>
          <span
            className="text-[length:var(--text-caption)] font-bold tracking-widest uppercase"
            style={{ color: "var(--color-primary-700)" }}
          >
            {leftPanelLabel}
          </span>
          {panelTitle ? (
            <p
              className="text-[length:var(--text-caption)] font-semibold text-center leading-snug"
              style={{ color: "var(--color-primary-700)" }}
            >
              {panelTitle}
            </p>
          ) : null}
        </div>

        {/* Right panel (white/surface) */}
        <div
          className="flex flex-col gap-4 p-6 flex-1"
          style={{ background: "var(--surface-sunken)" }}
        >
          {/* Close button */}
          <button
            type="button"
            aria-label="Close"
            onClick={dismiss}
            className={clsx(
              "absolute top-3 right-3",
              "w-11 h-11 flex items-center justify-center",
              "rounded-full text-[var(--color-neutral-500)]",
              "hover:bg-[var(--color-neutral-100)]",
              "transition-colors",
            )}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M1 1l12 12M13 1L1 13"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>

          {status === "success" ? (
            /* Success state */
            <div className="flex flex-col gap-2 pt-2">
              <h2
                id="exit-popup-heading"
                className="font-heading font-bold text-[var(--color-brand-text)]"
                style={{ fontSize: "var(--text-heading)" }}
              >
                {successMessage}
              </h2>
              <p className="text-[length:var(--text-caption)] text-[var(--color-brand-muted)]">
                {successSubMessage}
              </p>
              {downloadUrl ? (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <a
                    href={downloadUrl}
                    target="_blank"
                    rel="noopener"
                    className="btn-primary btn-shimmer inline-flex items-center justify-center"
                  >
                    Download now
                  </a>
                  <a
                    href="/pricing/"
                    className="btn-secondary inline-flex items-center justify-center"
                    onClick={() =>
                      trackEvent("lead_magnet_secondary_trial_click", {
                        magnet_slug: leadMagnet?.slug,
                        placement: "popup",
                        source_page: "exit-popup",
                        target: "/pricing/",
                      })
                    }
                  >
                    See Pricing
                  </a>
                </div>
              ) : null}
            </div>
          ) : (
            /* Form state */
            <>
              <h2
                id="exit-popup-heading"
                className="font-heading font-bold text-[var(--color-brand-text)] pr-8 leading-snug"
                style={{ fontSize: "var(--text-heading)" }}
              >
                {headline}
              </h2>
              <p className="text-[length:var(--text-caption)] text-[var(--color-brand-muted)]">
                {resolvedDescription}
              </p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
                  ref={emailInputRef}
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
                  aria-describedby="exit-popup-error"
                  className={clsx(
                    "w-full min-h-[44px] px-4 py-2.5 rounded-[var(--radius-md)] border",
                    "bg-[var(--surface-sunken)]",
                    "focus:outline-none focus:border-[var(--color-primary-500)] focus:border-2",
                    "transition-[border-color] duration-[var(--transition-fast)]",
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
                    "w-full",
                    "disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100",
                    status === "loading" && "cursor-wait",
                  )}
                >
                  {status === "loading"
                    ? (loadingText ?? "Sending\u2026")
                    : ctaText}
                </button>
                <TurnstileBoundary
                  onError={() => setTurnstileUnavailable(true)}
                >
                  <TurnstileWidget onVerify={handleTurnstileVerify} />
                </TurnstileBoundary>
              </form>

              <p
                id="exit-popup-error"
                aria-live="polite"
                className={
                  isError ? "text-[var(--color-error-500)]" : "sr-only"
                }
                style={
                  isError ? { fontSize: "var(--text-caption)" } : undefined
                }
              >
                {isError ? currentErrorMessage : ""}
              </p>

              <p
                className="text-[var(--color-brand-muted)]"
                style={{ fontSize: "var(--text-caption)" }}
              >
                {privacyNote}
              </p>

              <button
                type="button"
                onClick={dismiss}
                className="inline-flex min-h-[44px] items-center transition-colors text-[var(--color-brand-muted)] underline underline-offset-2 hover:text-[var(--color-brand-text)] text-left"
                style={{ fontSize: "var(--text-caption)" }}
              >
                {declineText}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
