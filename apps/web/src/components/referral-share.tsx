import { useState, useEffect, useRef } from "react";
import type { ReferralReward } from "../lib/types";
import { trackEvent } from "../lib/analytics";

interface ReferralShareProps {
  referralUrl: string;
  position: number;
  rewards: ReferralReward[];
  productName: string;
  /** Use #{position} as placeholder. Example: "You're signup ##{position}" renders as "You're signup #42" */
  positionLabel?: string;
  sharePrompt?: string;
  copiedText?: string;
  copyText?: string;
  shareXText?: string;
  shareLinkedInText?: string;
  tweetTemplate?: string;
  rewardsLabel?: string;
}

export function ReferralShare({
  referralUrl,
  position,
  rewards,
  productName,
  positionLabel = "You're signup ##{position}",
  sharePrompt = "Share to get access sooner",
  copiedText = "Copied!",
  copyText = "Copy",
  shareXText = "Share on X",
  shareLinkedInText = "Share on LinkedIn",
  tweetTemplate,
  rewardsLabel = "Referral rewards:",
}: ReferralShareProps) {
  const [copied, setCopied] = useState(false);
  const [manualCopyMessage, setManualCopyMessage] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setManualCopyMessage(false);
      trackEvent("referral_link_copied");
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      inputRef.current?.focus();
      inputRef.current?.select();
      setManualCopyMessage(true);
    }
  }

  const resolvedTweet = tweetTemplate ?? `Check out ${productName}`;
  const tweetText = encodeURIComponent(`${resolvedTweet} - ${referralUrl}`);
  const twitterUrl = `https://twitter.com/intent/tweet?text=${tweetText}`;
  const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(referralUrl)}`;

  return (
    <div className="text-left">
      <p className="u-kicker-serif text-[var(--color-accent-600)] mb-1">
        {positionLabel.replace("#{position}", String(position))}
      </p>
      <p
        className="text-[var(--color-brand-muted)] mb-3"
        style={{ fontSize: "var(--text-caption)" }}
      >
        {sharePrompt}
      </p>

      <div className="flex gap-2 mb-3">
        <input
          ref={inputRef}
          data-referral-url
          type="text"
          readOnly
          aria-label="Referral URL"
          value={referralUrl}
          className="font-mono flex-1 min-h-[44px] px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-neutral-200)] bg-[var(--surface-sunken)] text-[var(--color-brand-text)] truncate"
          style={{
            fontSize: "16px",
          }}
        />
        <button
          onClick={copyToClipboard}
          className={[
            copied
              ? "btn-shimmer inline-flex items-center justify-center px-3 py-2 font-semibold rounded-full transition-colors min-w-[70px] min-h-[44px] bg-[var(--color-success-100)] text-[var(--color-success-700)] border border-[var(--color-success-300)]"
              : "btn-primary btn-shimmer inline-flex items-center justify-center px-3 py-2 min-w-[70px] min-h-[44px]",
          ].join("")}
          style={{ fontSize: "var(--text-caption)" }}
        >
          {copied ? copiedText : copyText}
        </button>
      </div>
      {manualCopyMessage && (
        <p
          className="text-[var(--color-brand-muted)] mb-3"
          style={{ fontSize: "var(--text-caption)" }}
        >
          Clipboard access is unavailable. Copy the selected URL manually.
        </p>
      )}

      <div className="flex gap-2 mb-3">
        <a
          href={twitterUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex min-h-[44px] items-center justify-center gap-1.5 px-3 py-2 text-[length:var(--text-caption)] font-medium rounded-[var(--radius-md)] border border-[var(--color-neutral-200)] text-[var(--color-brand-text)] hover:bg-[var(--surface-secondary)] transition-colors"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          {shareXText}
        </a>
        <a
          href={linkedInUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex min-h-[44px] items-center justify-center gap-1.5 px-3 py-2 text-[length:var(--text-caption)] font-medium rounded-[var(--radius-md)] border border-[var(--color-neutral-200)] text-[var(--color-brand-text)] hover:bg-[var(--surface-secondary)] transition-colors"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
          </svg>
          {shareLinkedInText}
        </a>
      </div>

      {rewards.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[length:var(--text-caption)] font-semibold text-[var(--color-brand-text)]">
            {rewardsLabel}
          </p>
          {rewards.map((reward) => (
            <div
              key={reward.threshold}
              className="flex items-center gap-2 text-[length:var(--text-caption)] text-[var(--color-brand-muted)]"
            >
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[var(--color-accent-100)] text-[var(--color-accent-700)] flex items-center justify-center font-bold text-[10px]">
                {reward.threshold}
              </span>
              {reward.description}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
