import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import * as bankRec from "../../src/db/schema/bankRec.js";
import * as portfolio from "../../src/db/schema/portfolio.js";
import * as close from "../../src/db/schema/monthEndClose.js";
import * as churn from "../../src/db/schema/churn.js";

describe("Phase 4 schema exports", () => {
  it("bankRec exports 4 tables", () => {
    expect(bankRec.bankStatements).toBeDefined();
    expect(bankRec.bankStatementLines).toBeDefined();
    expect(bankRec.reconciliations).toBeDefined();
    expect(bankRec.reconciliationMatches).toBeDefined();
  });
  it("portfolio exports 2 tables", () => {
    expect(portfolio.portfolios).toBeDefined();
    expect(portfolio.portfolioCommunities).toBeDefined();
  });
  it("monthEndClose exports 2 tables", () => {
    expect(close.monthEndCloses).toBeDefined();
    expect(close.closeChecklistItems).toBeDefined();
  });
  it("churn exports 1 table", () => {
    expect(churn.churnReasons).toBeDefined();
  });
});

describe("bankStatements columns", () => {
  it("has required columns", () => {
    const cols = Object.keys(getTableColumns(bankRec.bankStatements));
    expect(cols).toContain("id");
    expect(cols).toContain("communityId");
    expect(cols).toContain("accountId");
    expect(cols).toContain("statementDate");
    expect(cols).toContain("beginningBalanceCents");
    expect(cols).toContain("endingBalanceCents");
    expect(cols).toContain("importedAt");
  });
});

describe("bankStatementLines columns", () => {
  it("has required columns", () => {
    const cols = Object.keys(getTableColumns(bankRec.bankStatementLines));
    expect(cols).toContain("id");
    expect(cols).toContain("statementId");
    expect(cols).toContain("communityId");
    expect(cols).toContain("postedDate");
    expect(cols).toContain("description");
    expect(cols).toContain("amountCents");
  });
});

describe("reconciliations columns", () => {
  it("has required columns", () => {
    const cols = Object.keys(getTableColumns(bankRec.reconciliations));
    expect(cols).toContain("id");
    expect(cols).toContain("communityId");
    expect(cols).toContain("statementId");
    expect(cols).toContain("status");
    expect(cols).toContain("finalizedAt");
    expect(cols).toContain("finalizedByUserId");
  });
});

describe("reconciliationMatches columns", () => {
  it("has required columns", () => {
    const cols = Object.keys(getTableColumns(bankRec.reconciliationMatches));
    expect(cols).toContain("id");
    expect(cols).toContain("reconciliationId");
    expect(cols).toContain("communityId");
    expect(cols).toContain("statementLineId");
    expect(cols).toContain("paymentId");
    expect(cols).toContain("journalLineId");
  });
});

describe("reconciliationStatusEnum", () => {
  it("is defined and has correct values", () => {
    expect(bankRec.reconciliationStatusEnum).toBeDefined();
    expect(bankRec.reconciliationStatusEnum.enumValues).toContain("open");
    expect(bankRec.reconciliationStatusEnum.enumValues).toContain("finalized");
    expect(bankRec.reconciliationStatusEnum.enumValues).toHaveLength(2);
  });
});

describe("portfolios columns", () => {
  it("has required columns", () => {
    const cols = Object.keys(getTableColumns(portfolio.portfolios));
    expect(cols).toContain("id");
    expect(cols).toContain("name");
    expect(cols).toContain("ownerUserId");
    expect(cols).toContain("createdAt");
  });
});

describe("portfolioCommunities columns", () => {
  it("has required columns", () => {
    const cols = Object.keys(getTableColumns(portfolio.portfolioCommunities));
    expect(cols).toContain("id");
    expect(cols).toContain("portfolioId");
    expect(cols).toContain("communityId");
    expect(cols).toContain("addedAt");
  });
});

describe("monthEndCloses columns", () => {
  it("has required columns", () => {
    const cols = Object.keys(getTableColumns(close.monthEndCloses));
    expect(cols).toContain("id");
    expect(cols).toContain("communityId");
    expect(cols).toContain("periodYear");
    expect(cols).toContain("periodMonth");
    expect(cols).toContain("status");
    expect(cols).toContain("startedAt");
    expect(cols).toContain("completedAt");
    expect(cols).toContain("auditPackKey");
  });
});

describe("closeChecklistItems columns", () => {
  it("has required columns", () => {
    const cols = Object.keys(getTableColumns(close.closeChecklistItems));
    expect(cols).toContain("id");
    expect(cols).toContain("closeId");
    expect(cols).toContain("communityId");
    expect(cols).toContain("step");
    expect(cols).toContain("completed");
    expect(cols).toContain("completedAt");
    expect(cols).toContain("completedByUserId");
  });
});

describe("closeStatusEnum", () => {
  it("is defined and has correct values", () => {
    expect(close.closeStatusEnum).toBeDefined();
    expect(close.closeStatusEnum.enumValues).toContain("open");
    expect(close.closeStatusEnum.enumValues).toContain("complete");
    expect(close.closeStatusEnum.enumValues).toHaveLength(2);
  });
});

describe("closeStepEnum", () => {
  it("is defined and has correct values", () => {
    expect(close.closeStepEnum).toBeDefined();
    expect(close.closeStepEnum.enumValues).toContain("reconcile_bank");
    expect(close.closeStepEnum.enumValues).toContain("review_tb");
    expect(close.closeStepEnum.enumValues).toContain("post_adjustments");
    expect(close.closeStepEnum.enumValues).toContain("finalize_minutes");
    expect(close.closeStepEnum.enumValues).toContain("generate_pack");
    expect(close.closeStepEnum.enumValues).toHaveLength(5);
  });
});

describe("churnReasons columns", () => {
  it("has required columns", () => {
    const cols = Object.keys(getTableColumns(churn.churnReasons));
    expect(cols).toContain("id");
    expect(cols).toContain("communityId");
    expect(cols).toContain("userId");
    expect(cols).toContain("reason");
    expect(cols).toContain("note");
    expect(cols).toContain("recordedAt");
  });
});
