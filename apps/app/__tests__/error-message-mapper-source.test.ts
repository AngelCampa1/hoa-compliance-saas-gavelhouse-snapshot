import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(relPath: string): string {
  return readFileSync(resolve(process.cwd(), "src", relPath), "utf8");
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ");
}

/**
 * Every call-site that previously used an ad-hoc
 * `err instanceof Error ? err.message : "Failed to X."` pattern feeding
 * toast.error / setError / an Alert must now go through
 * reportUserFacingError from @/lib/sentry.
 *
 * Each case asserts:
 *   1. The file imports / calls reportUserFacingError.
 *   2. The old raw fallback string is gone.
 */
/**
 * oldFallback is null for files where the old fallback string still appears
 * in a resolved-error (non-thrown) path that was intentionally left unchanged.
 * In those files we only assert reportUserFacingError is present.
 */
const cases: Array<{ file: string; oldFallback: string | null }> = [
  // ── Non-route components ─────────────────────────────────────────────────
  {
    file: "components/billing/CancelReasonModal.tsx",
    oldFallback: "Cancellation failed.",
  },
  {
    file: "components/close/CloseChecklist.tsx",
    oldFallback: "Failed to update step.",
  },
  {
    file: "components/governance/AddHomeownerDialog.tsx",
    oldFallback: "Failed to add homeowner.",
  },
  // ── Route files ──────────────────────────────────────────────────────────
  {
    file: "routes/forgot-password.tsx",
    // "Failed to send reset email." still present in resolved-error path (intentional)
    oldFallback: null,
  },
  {
    file: "routes/reset-password.tsx",
    // "Password reset failed." still present in resolved-error path (intentional)
    oldFallback: null,
  },
  {
    file: "routes/_app.billing.tsx",
    oldFallback: "Failed to start trial.",
  },
  {
    file: "routes/_app.close.tsx",
    oldFallback: "Failed to start close.",
  },
  {
    file: "routes/_app.finance.accounts.tsx",
    oldFallback: "Failed to update account.",
  },
  {
    file: "routes/_app.finance.dues.tsx",
    oldFallback: "Failed to mark as paid.",
  },
  {
    file: "routes/_app.finance.journal.tsx",
    oldFallback: "Failed to post journal entry.",
  },
  {
    file: "routes/_app.finance.reserves.tsx",
    oldFallback: "Failed to record acknowledgement.",
  },
  {
    file: "routes/_app.governance.arch-requests.tsx",
    oldFallback: "Failed to submit request.",
  },
  {
    file: "routes/_app.governance.homeowners.tsx",
    oldFallback: "Failed to generate portal link.",
  },
  {
    file: "routes/_app.governance.meetings.tsx",
    oldFallback: "Failed to schedule meeting.",
  },
  {
    file: "routes/_app.governance.transitions.tsx",
    oldFallback: "Failed to acknowledge transition.",
  },
  {
    file: "routes/_app.governance.violations.tsx",
    oldFallback: "Failed to update status.",
  },
  {
    file: "routes/_app.portfolio.index.tsx",
    oldFallback: "Failed to create portfolio.",
  },
  {
    file: "routes/_app.reports.audit-pack.tsx",
    oldFallback: "Failed to download audit pack.",
  },
  {
    file: "routes/_app.settings.tsx",
    oldFallback: "Failed to send invitation.",
  },
];

describe("error-message-mapper source assertions", () => {
  for (const { file, oldFallback } of cases) {
    it(`${file} uses reportUserFacingError and drops old fallback`, () => {
      const src = normalize(read(file));
      expect(src).toContain("reportUserFacingError");
      if (oldFallback !== null) {
        expect(src).not.toContain(oldFallback);
      }
    });
  }
});
