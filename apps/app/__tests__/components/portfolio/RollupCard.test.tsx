import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RollupCard,
  reserveHealthVariant,
} from "@/components/portfolio/RollupCard";
import type { CommunityRollup } from "@/lib/api";

describe("reserveHealthVariant", () => {
  it("returns success for pct >= 80", () => {
    expect(reserveHealthVariant(80)).toBe("success");
    expect(reserveHealthVariant(100)).toBe("success");
    expect(reserveHealthVariant(95.5)).toBe("success");
  });

  it("returns warning for pct >= 50 and < 80", () => {
    expect(reserveHealthVariant(50)).toBe("warning");
    expect(reserveHealthVariant(65)).toBe("warning");
    expect(reserveHealthVariant(79.9)).toBe("warning");
  });

  it("returns destructive for pct < 50", () => {
    expect(reserveHealthVariant(0)).toBe("destructive");
    expect(reserveHealthVariant(25)).toBe("destructive");
    expect(reserveHealthVariant(49.9)).toBe("destructive");
  });

  it("returns destructive for null", () => {
    expect(reserveHealthVariant(null)).toBe("destructive");
  });
});

describe("RollupCard", () => {
  const rollup: CommunityRollup = {
    communityId: "comm-1",
    communityName: "Sunset Villas HOA",
    reservePctFunded: 82.5,
    fannieMaeCompliant: true,
    fannieMaeComplianceBasis: null,
    overdueAssessmentsCents: 150000,
    lastCloseMonth: "2026-01",
  };

  it("renders community name", () => {
    render(<RollupCard rollup={rollup} />);
    expect(screen.getByText("Sunset Villas HOA")).toBeTruthy();
  });

  it("renders reserve percentage", () => {
    render(<RollupCard rollup={rollup} />);
    expect(screen.getByText("82.5%")).toBeTruthy();
  });

  it("renders Fannie Mae compliant badge", () => {
    render(<RollupCard rollup={rollup} />);
    expect(screen.getByText("Compliant")).toBeTruthy();
  });

  it("renders non-compliant badge when fannieMaeCompliant is false", () => {
    render(<RollupCard rollup={{ ...rollup, fannieMaeCompliant: false }} />);
    expect(screen.getByText("Non-compliant")).toBeTruthy();
  });

  it("renders Unknown when fannieMaeCompliant is null", () => {
    render(<RollupCard rollup={{ ...rollup, fannieMaeCompliant: null }} />);
    expect(screen.getByText("Unknown")).toBeTruthy();
  });

  it("renders overdue assessments amount", () => {
    render(<RollupCard rollup={rollup} />);
    expect(screen.getByText("$1,500.00")).toBeTruthy();
  });

  it("renders last close month label and value", () => {
    render(<RollupCard rollup={rollup} />);
    expect(screen.getByText(/Last close:/)).toBeTruthy();
    expect(screen.getByText("2026-01")).toBeTruthy();
  });

  it("renders N/A for null reservePctFunded", () => {
    render(<RollupCard rollup={{ ...rollup, reservePctFunded: null }} />);
    expect(screen.getByText("N/A")).toBeTruthy();
  });

  it("does not render last close section when null", () => {
    render(<RollupCard rollup={{ ...rollup, lastCloseMonth: null }} />);
    expect(screen.queryByText(/Last close:/)).toBeNull();
  });
});
