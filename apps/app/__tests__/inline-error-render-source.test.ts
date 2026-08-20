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
 * These routes rendered a mutation error directly in JSX
 * (`{someMutation.error?.message}`), which leaks the raw server/DB/Stripe
 * message to the user. Each now maps through the render-safe
 * `userFacingErrorMessage` helper (4xx actionable messages pass through; 5xx /
 * unknown errors fall back to friendly copy; no Sentry capture on render).
 *
 * Each case asserts:
 *   1. The file imports + calls userFacingErrorMessage.
 *   2. The specific raw `<mutation>.error?.message` render is gone.
 */
const cases: Array<{ file: string; rawRender: string }> = [
  {
    file: "routes/_app.finance.accounts.tsx",
    rawRender: "{updateMutation.error?.message}",
  },
  {
    file: "routes/_app.finance.dues.tsx",
    rawRender: "{payMutation.error?.message}",
  },
  {
    file: "routes/_app.finance.dues.tsx",
    rawRender: "{createAssessmentMutation.error?.message}",
  },
  {
    file: "routes/_app.finance.reserves.tsx",
    rawRender: "{allocationMutation.error?.message",
  },
  {
    file: "routes/invitations.$token.accept.tsx",
    rawRender: "{mutation.error?.message",
  },
];

describe("inline mutation-error renders go through userFacingErrorMessage", () => {
  for (const { file, rawRender } of cases) {
    describe(file, () => {
      const src = normalize(read(file));

      it("imports + calls userFacingErrorMessage", () => {
        expect(src).toContain("userFacingErrorMessage");
        expect(src).toContain('from "@/lib/sentry"');
      });

      it(`no longer renders the raw ${rawRender}`, () => {
        expect(src).not.toContain(normalize(rawRender));
      });
    });
  }
});
