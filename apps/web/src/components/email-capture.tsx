import { useState, useEffect, useId, useRef, useCallback } from "react";
import type { ChangeEvent, ComponentProps } from "react";
import { clsx } from "clsx";
import { PostSignupSurvey } from "./post-signup-survey";
import type {
  SurveyQuestion,
  ReferralReward,
  SurveyQualificationConfig,
} from "../lib/types";
import { EMAIL_REGEX } from "../lib/email-validation";
import { trackEvent } from "../lib/analytics";
import {
  captureHttpError,
  formatUserError,
  reportUserFacingError,
} from "../lib/sentry-client";
import {
  trackEmailFocus,
  trackEmailBlurWithoutSubmit,
} from "../lib/form-interaction-tracker";
import {
  persistSignupAttribution,
  resolveSignupAttribution,
} from "../lib/signup-attribution";
import type { PublicSignupFlowConfig } from "../lib/public-signup-flow";
import { TurnstileWidget } from "./turnstile-widget";

interface SignupResponse {
  referralCode?: string;
  position?: number;
  surveyToken?: string;
}

type FormSubmitEvent = Parameters<
  NonNullable<ComponentProps<"form">["onSubmit"]>
>[0];

type SubmitStatus =
  | "idle"
  | "loading"
  | "success"
  | "error-validation"
  | "error-duplicate"
  | "error-generic";

const PRE_SUBMIT_QUESTION_COPY_PATTERN =
  /\b(question|questions|survey|questionnaire)\b/i;

interface EmailCaptureProps {
  apiUrl: string;
  sourcePage: string;
  buttonText?: string;
  placeholder?: string;
  emailLabel?: string;
  inputId?: string;
  signupFlowConfigUrl?: string;
  surveyQuestions?: SurveyQuestion[];
  surveyQualification?: SurveyQualificationConfig;
  qualification?: SurveyQualificationConfig;
  discoveryCallUrl?: string;
  subtitle?: string;
  whatHappensNext?: string;
  privacyNote?: string;
  errorInvalidEmail?: string;
  errorDuplicate?: string;
  errorGeneric?: string;
  successMessage?: string;
  surveyPreview?: string;
  referralRewards?: ReferralReward[];
  productName?: string;
  productDomain?: string;
  qualifiedHeading?: string;
  qualifiedBody?: string;
  qualifiedCtaText?: string;
  unqualifiedHeading?: string;
  unqualifiedBody?: string;
  unqualifiedCtaText?: string;
  unqualifiedCtaTarget?: string;
  qualifiedDismissText?: string;
  unqualifiedDismissText?: string;
  ariaLabel?: string;
  loadingText?: string;
}

export function EmailCapture({
  apiUrl,
  sourcePage,
  buttonText = "Continue",
  placeholder,
  emailLabel = "Email address",
  inputId,
  signupFlowConfigUrl,
  surveyQuestions,
  surveyQualification,
  qualification,
  discoveryCallUrl,
  subtitle,
  whatHappensNext,
  privacyNote,
  errorInvalidEmail = "Please enter a valid email address",
  errorDuplicate,
  errorGeneric = "Something went wrong. Please try again.",
  successMessage = "You're in!",
  surveyPreview,
  referralRewards,
  productName,
  productDomain,
  qualifiedHeading,
  qualifiedBody,
  qualifiedCtaText,
  unqualifiedHeading,
  unqualifiedBody,
  unqualifiedCtaText,
  unqualifiedCtaTarget,
  qualifiedDismissText,
  unqualifiedDismissText,
  ariaLabel = "Continue with your email",
  loadingText = "Sending…",
}: EmailCaptureProps) {
  const generatedInputId = useId().replace(/:/g, "");
  const resolvedInputId = inputId ?? `email-capture-${generatedInputId}`;
  const errorId = `${resolvedInputId}-error`;
  const [loadedSignupFlowConfig, setLoadedSignupFlowConfig] =
    useState<PublicSignupFlowConfig | null>(null);
  const [isLoadingSignupFlowConfig, setIsLoadingSignupFlowConfig] = useState(
    Boolean(signupFlowConfigUrl),
  );
  const [signupFlowLoadError, setSignupFlowLoadError] = useState<string | null>(
    null,
  );
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>(
    undefined,
  );
  const handleTurnstileVerify = useCallback((token: string | undefined) => {
    setTurnstileToken(token);
  }, []);
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [genericErrorMessage, setGenericErrorMessage] = useState(errorGeneric);
  const [showSurvey, setShowSurvey] = useState(false);
  const [referralCode, setReferralCode] = useState<string | undefined>();
  const [position, setPosition] = useState<number | undefined>();
  const [surveyToken, setSurveyToken] = useState<string | undefined>();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signupFlowRequestRef =
    useRef<Promise<PublicSignupFlowConfig | null> | null>(null);
  const inlineSignupFlowConfig =
    surveyQuestions && discoveryCallUrl
      ? ({
          surveyQuestions,
          surveyQualification,
          qualification: qualification ?? surveyQualification,
          discoveryCallUrl,
          subtitle,
          whatHappensNext,
          privacyNote,
          errorInvalidEmail,
          errorDuplicate,
          errorGeneric,
          successMessage,
          surveyPreview,
          referralRewards,
          productName,
          productDomain,
          qualifiedHeading,
          qualifiedBody,
          qualifiedCtaText,
          unqualifiedHeading,
          unqualifiedBody,
          unqualifiedCtaText,
          unqualifiedCtaTarget,
          qualifiedDismissText,
          unqualifiedDismissText,
        } satisfies PublicSignupFlowConfig)
      : null;
  const resolvedSignupFlowConfig =
    loadedSignupFlowConfig ?? inlineSignupFlowConfig;
  const resolvedQualification =
    resolvedSignupFlowConfig?.qualification ??
    resolvedSignupFlowConfig?.surveyQualification;
  const resolvedSubtitle = subtitle ?? resolvedSignupFlowConfig?.subtitle;
  const visibleWhatHappensNext =
    (whatHappensNext ?? resolvedSignupFlowConfig?.whatHappensNext) &&
    !PRE_SUBMIT_QUESTION_COPY_PATTERN.test(
      whatHappensNext ?? resolvedSignupFlowConfig?.whatHappensNext ?? "",
    )
      ? (whatHappensNext ?? resolvedSignupFlowConfig?.whatHappensNext)
      : undefined;

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    persistSignupAttribution();
  }, []);

  async function loadSignupFlowConfig(): Promise<PublicSignupFlowConfig | null> {
    if (inlineSignupFlowConfig) {
      setSignupFlowLoadError(null);
      setIsLoadingSignupFlowConfig(false);
      return inlineSignupFlowConfig;
    }

    if (!signupFlowConfigUrl) {
      setIsLoadingSignupFlowConfig(false);
      return null;
    }

    if (!signupFlowRequestRef.current) {
      setIsLoadingSignupFlowConfig(true);
      setSignupFlowLoadError(null);
      signupFlowRequestRef.current = (async () => {
        const response = await fetch(signupFlowConfigUrl);
        if (!response.ok) {
          const trackingId = captureHttpError(response.status, {
            tags: { source: "email-capture-config" },
            extra: { sourcePage },
          });
          throw Object.assign(
            new Error(
              `Failed to load signup flow config from ${signupFlowConfigUrl}`,
            ),
            { status: response.status, trackingId },
          );
        }

        const config = (await response.json()) as PublicSignupFlowConfig;
        setLoadedSignupFlowConfig(config);
        setIsLoadingSignupFlowConfig(false);
        return config;
      })().catch((error) => {
        signupFlowRequestRef.current = null;
        setIsLoadingSignupFlowConfig(false);
        setSignupFlowLoadError(
          reportUserFacingError(
            error,
            "We couldn't load the signup form. Please try again.",
            {
              tags: { source: "email-capture-config" },
              extra: { sourcePage },
            },
          ),
        );
        return null;
      });
    }

    return signupFlowRequestRef.current;
  }

  useEffect(() => {
    void loadSignupFlowConfig();
  }, [signupFlowConfigUrl]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("survey") === "open") {
      const encoded = params.get("e");
      if (encoded) {
        try {
          const decodedEmail = atob(encoded);
          if (EMAIL_REGEX.test(decodedEmail)) {
            setEmail(decodedEmail);
            setStatus("success");
            setShowSurvey(true);
          }
        } catch {
          // ignore malformed base64
        }
      }
      const token = params.get("t");
      if (token) {
        setSurveyToken(token);
      }
    }
  }, []);

  function handleEmailChange(e: ChangeEvent<HTMLInputElement>) {
    setEmail(e.target.value);
    if (status.startsWith("error")) {
      setStatus("idle");
    }
  }

  async function handleSubmit(e: FormSubmitEvent) {
    e.preventDefault();

    if (!EMAIL_REGEX.test(email)) {
      trackEvent("form_submission_failed", {
        form_name: "email_capture",
        source_page: sourcePage,
        failure_type: "validation",
      });
      setStatus("error-validation");
      return;
    }

    setStatus("loading");

    try {
      const attribution = resolveSignupAttribution();
      const res = await fetch(`${apiUrl}/waitlist/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          sourcePage,
          utmSource: attribution.utmSource,
          utmMedium: attribution.utmMedium,
          utmCampaign: attribution.utmCampaign,
          referredBy: attribution.referredBy,
          companyWebsite: honeypot || undefined,
          turnstileToken,
        }),
      });

      if (res.ok) {
        try {
          const data = (await res.json()) as SignupResponse;
          if (data.referralCode) {
            setReferralCode(data.referralCode);
          }
          if (typeof data.position === "number") {
            setPosition(data.position);
          }
          if (data.surveyToken) {
            setSurveyToken(data.surveyToken);
          }
        } catch {
          // Response may not be JSON - continue without referral data
        }
        const utmProps: Record<string, string> = {};
        const utmSource = attribution.utmSource;
        const utmMedium = attribution.utmMedium;
        const utmCampaign = attribution.utmCampaign;
        if (utmSource) utmProps.utm_source = utmSource;
        if (utmMedium) utmProps.utm_medium = utmMedium;
        if (utmCampaign) utmProps.utm_campaign = utmCampaign;
        trackEvent("signup_completed", {
          source_page: sourcePage,
          has_referral: attribution.referredBy !== undefined,
          ...utmProps,
        });
        trackEvent("waitlist_submitted", {
          source: "email_capture",
          source_page: sourcePage,
          ...utmProps,
        });
        setStatus("success");
        timerRef.current = setTimeout(() => {
          setShowSurvey(true);
        }, 1500);
      } else if (res.status === 409) {
        trackEvent("signup_duplicate", { source_page: sourcePage });
        if (errorDuplicate) {
          setStatus("error-duplicate");
        } else {
          try {
            const data = (await res.json()) as SignupResponse;
            if (data.referralCode) {
              setReferralCode(data.referralCode);
            }
            if (typeof data.position === "number") {
              setPosition(data.position);
            }
            if (data.surveyToken) {
              setSurveyToken(data.surveyToken);
            }
          } catch {
            // continue without referral data
          }
          setStatus("success");
          timerRef.current = setTimeout(() => {
            setShowSurvey(true);
          }, 1500);
        }
      } else {
        const eventId = captureHttpError(res.status, {
          tags: { source: "email-capture-submit" },
          extra: { sourcePage },
        });
        trackEvent("form_submission_failed", {
          form_name: "email_capture",
          source_page: sourcePage,
          failure_type: "http_error",
          status_code: res.status,
        });
        setGenericErrorMessage(formatUserError(errorGeneric, eventId));
        setStatus("error-generic");
      }
    } catch (err) {
      trackEvent("form_submission_failed", {
        form_name: "email_capture",
        source_page: sourcePage,
        failure_type: "network_error",
      });
      setGenericErrorMessage(
        reportUserFacingError(err, errorGeneric, {
          tags: { source: "email-capture-submit" },
          extra: { sourcePage },
        }),
      );
      setStatus("error-generic");
    }
  }

  if (showSurvey) {
    return (
      <PostSignupSurvey
        apiUrl={apiUrl}
        surveyToken={surveyToken}
        questions={resolvedSignupFlowConfig?.surveyQuestions ?? []}
        qualificationConfig={resolvedQualification}
        qualification={resolvedQualification}
        discoveryCallUrl={resolvedSignupFlowConfig?.discoveryCallUrl ?? ""}
        onComplete={() => setShowSurvey(false)}
        referralCode={referralCode}
        position={position}
        referralRewards={
          referralRewards ?? resolvedSignupFlowConfig?.referralRewards
        }
        productName={productName ?? resolvedSignupFlowConfig?.productName}
        productDomain={productDomain ?? resolvedSignupFlowConfig?.productDomain}
        qualifiedHeading={
          qualifiedHeading ?? resolvedSignupFlowConfig?.qualifiedHeading
        }
        qualifiedBody={qualifiedBody ?? resolvedSignupFlowConfig?.qualifiedBody}
        qualifiedCtaText={
          qualifiedCtaText ?? resolvedSignupFlowConfig?.qualifiedCtaText
        }
        unqualifiedHeading={
          unqualifiedHeading ?? resolvedSignupFlowConfig?.unqualifiedHeading
        }
        unqualifiedBody={
          unqualifiedBody ?? resolvedSignupFlowConfig?.unqualifiedBody
        }
        unqualifiedCtaText={
          unqualifiedCtaText ?? resolvedSignupFlowConfig?.unqualifiedCtaText
        }
        unqualifiedCtaTarget={
          unqualifiedCtaTarget ?? resolvedSignupFlowConfig?.unqualifiedCtaTarget
        }
        qualifiedDismissText={
          qualifiedDismissText ?? resolvedSignupFlowConfig?.qualifiedDismissText
        }
        unqualifiedDismissText={
          unqualifiedDismissText ??
          resolvedSignupFlowConfig?.unqualifiedDismissText
        }
        sourcePage={sourcePage}
      />
    );
  }

  const isError =
    status === "error-validation" ||
    status === "error-duplicate" ||
    status === "error-generic";
  const isTurnstilePending =
    Boolean(import.meta.env.PUBLIC_TURNSTILE_SITE_KEY) && !turnstileToken;
  const isSubmitDisabled =
    status === "loading" || status === "success" || isTurnstilePending;

  const currentErrorMessage =
    status === "error-validation"
      ? errorInvalidEmail
      : status === "error-duplicate"
        ? errorDuplicate
        : status === "error-generic"
          ? genericErrorMessage
          : "";

  if (!resolvedSignupFlowConfig) {
    if (signupFlowLoadError) {
      return (
        <div
          className="max-w-md mx-auto space-y-4 text-center"
          style={{ gap: "var(--component-gap-sm)" }}
        >
          <h3 className="font-heading text-[length:var(--text-subheading)] font-bold text-[var(--color-brand-text)]">
            We couldn't load the signup form.
          </h3>
          <p className="text-[length:var(--text-body)] leading-7 text-[var(--color-brand-muted)]">
            {signupFlowLoadError}
          </p>
          <button
            type="button"
            className="btn-primary mx-auto"
            onClick={() => void loadSignupFlowConfig()}
          >
            Try again
          </button>
        </div>
      );
    }

    return (
      <div
        className="max-w-md mx-auto space-y-4 text-center"
        style={{ gap: "var(--component-gap-sm)" }}
      >
        <h3 className="font-heading text-[length:var(--text-subheading)] font-bold text-[var(--color-brand-text)]">
          Loading signup form…
        </h3>
        <p className="text-[length:var(--text-body)] leading-7 text-[var(--color-brand-muted)]">
          We&apos;re preparing the next step for you.
        </p>
        {isLoadingSignupFlowConfig ? (
          <div
            className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-neutral-300)] border-t-[var(--color-accent-500)]"
            aria-hidden="true"
          />
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="max-w-md mx-auto"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--component-gap-sm)",
      }}
    >
      <form
        onSubmit={handleSubmit}
        aria-label={ariaLabel}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--component-gap-sm)",
        }}
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
        <div
          className="flex flex-col sm:flex-row items-end"
          style={{ gap: "var(--component-gap-sm)" }}
        >
          <div className="flex flex-col gap-1 flex-1">
            <label
              htmlFor={resolvedInputId}
              className="font-medium text-[var(--color-brand-text)]"
              style={{ fontSize: "var(--text-caption)" }}
            >
              {emailLabel}
            </label>
            <input
              id={resolvedInputId}
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={handleEmailChange}
              onFocus={() => trackEmailFocus(sourcePage)}
              onBlur={() => {
                if (status !== "success" && status !== "loading") {
                  trackEmailBlurWithoutSubmit(sourcePage, email.length > 0);
                }
              }}
              placeholder={placeholder ?? "your@email.com"}
              aria-invalid={isError}
              aria-describedby={errorId}
              className={clsx(
                "w-full px-4 py-3 rounded-[var(--radius-md)] border",
                "bg-[var(--surface-sunken)]",
                "focus:outline-none focus:border-[var(--color-primary-500)] focus:border-2 focus:shadow-[var(--shadow-glow-primary)]",
                "transition-[border-color] duration-[var(--transition-fast)]",
                isError
                  ? "border-[var(--color-error-500)] animate-[shake_0.4s_ease-in-out]"
                  : "border-[var(--color-neutral-300)]",
              )}
              disabled={status === "loading"}
              style={{
                caretColor: "var(--color-primary-500)",
                fontSize: "16px",
                boxShadow: "var(--shadow-md)",
              }}
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitDisabled}
            className={clsx(
              "btn-primary btn-shimmer",
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100",
              "flex items-center justify-center gap-2 w-full sm:w-auto sm:min-w-[140px]",
              status === "loading" && "cursor-wait",
            )}
          >
            {status === "loading" ? (
              <>
                <span
                  className="w-4 h-4 rounded-full border-2 border-[var(--color-accent-950)] border-t-transparent animate-spin"
                  aria-hidden="true"
                />
                <span>{loadingText}</span>
              </>
            ) : status === "success" ? (
              <>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    cx="8"
                    cy="8"
                    r="8"
                    fill="currentColor"
                    opacity="0.2"
                  />
                  <path
                    d="M4.5 8l2.5 2.5 4.5-5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {successMessage && <span>{successMessage}</span>}
              </>
            ) : (
              buttonText
            )}
          </button>
        </div>
        <TurnstileWidget onVerify={handleTurnstileVerify} />
      </form>

      {status === "success" &&
      (surveyPreview ?? resolvedSignupFlowConfig?.surveyPreview) ? (
        <p
          className="text-[var(--color-brand-muted)] text-center"
          style={{ fontSize: "var(--text-caption)" }}
        >
          {surveyPreview ?? resolvedSignupFlowConfig?.surveyPreview}
        </p>
      ) : null}

      <p
        id={errorId}
        aria-live="polite"
        className={
          isError && !!currentErrorMessage
            ? "text-[var(--color-error-500)]"
            : "sr-only"
        }
        style={
          isError && !!currentErrorMessage
            ? { fontSize: "var(--text-caption)" }
            : undefined
        }
      >
        {isError ? currentErrorMessage : ""}
      </p>

      {resolvedSubtitle ? (
        <p
          className="font-semibold text-[var(--color-brand-text)] text-center"
          style={{ fontSize: "var(--text-caption)" }}
        >
          {resolvedSubtitle}
        </p>
      ) : null}

      {(privacyNote ?? resolvedSignupFlowConfig?.privacyNote) ? (
        <p
          className="text-[var(--color-brand-muted)]"
          style={{ fontSize: "var(--text-caption)" }}
        >
          {privacyNote ?? resolvedSignupFlowConfig?.privacyNote}
        </p>
      ) : null}

      {status === "idle" && visibleWhatHappensNext ? (
        <p
          className="text-[var(--color-brand-muted)] text-center"
          style={{ fontSize: "var(--text-caption)" }}
        >
          {visibleWhatHappensNext}
        </p>
      ) : null}
    </div>
  );
}
