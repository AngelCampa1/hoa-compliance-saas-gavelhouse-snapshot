import { captureUnexpectedError } from "@/lib/sentry";
import type { BillingStatusResponse } from "@boardstack/shared";
import { triggerBrowserDownload } from "./download";

export function getApiBase(): string {
  const configured = import.meta.env["VITE_API_URL"] as string | undefined;
  const isConfigured = configured !== undefined && configured.trim() !== "";
  if (import.meta.env.PROD && !isConfigured) {
    throw new Error("VITE_API_URL must be set in production builds");
  }
  return isConfigured ? configured : "http://localhost:8060";
}

export class ApiError extends Error {
  readonly path: string;
  readonly status: number;
  readonly trackingId?: string;

  constructor(
    message: string,
    status: number,
    path: string,
    trackingId?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.path = path;
    this.trackingId = trackingId;
  }
}

type ErrorBody = {
  error?: string;
  trackingId?: string;
};

function formatApiErrorMessage(
  body: ErrorBody,
  status: number,
): { message: string; trackingId?: string } {
  const trackingId =
    typeof body.trackingId === "string" && body.trackingId.length > 0
      ? body.trackingId
      : undefined;
  const baseMessage = body.error ?? `HTTP ${status}`;
  return {
    message: trackingId
      ? `${baseMessage} Tracking ID: ${trackingId}`
      : baseMessage,
    trackingId,
  };
}

async function parseErrorBody(
  res: Response,
  fallbackMessage: string,
): Promise<ErrorBody> {
  if (typeof res.json !== "function") {
    return { error: fallbackMessage };
  }

  try {
    return (await res.json()) as ErrorBody;
  } catch (parseError) {
    let responseText: string | undefined;
    try {
      if (typeof res.text === "function") {
        responseText = await res.text();
      }
    } catch {
      // ignore secondary read failure
    }
    captureUnexpectedError(parseError, {
      tags: { source: "parse-error-body", status: res.status },
      extra: { responseText: responseText ?? "(unreadable)" },
    });
    return { error: fallbackMessage };
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await parseErrorBody(res, "Unknown error");
    const { message, trackingId } = formatApiErrorMessage(body, res.status);
    throw new ApiError(message, res.status, path, trackingId);
  }
  return res.json() as Promise<T>;
}

async function downloadBlob(
  path: string,
  params: Record<string, string>,
  filename: string,
): Promise<void> {
  const qs = new URLSearchParams(params);
  const res = await fetch(`${getApiBase()}${path}?${qs.toString()}`, {
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseErrorBody(res, `HTTP ${res.status}`);
    const { message, trackingId } = formatApiErrorMessage(body, res.status);
    throw new ApiError(message, res.status, path, trackingId);
  }
  const blob = await res.blob();
  triggerBrowserDownload({ blob, filename });
}

export type Community = {
  id: string;
  name: string;
  slug: string;
  state: string | null;
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type CommunityUsageResponse = {
  homes: number;
  boardUsers: number;
  pendingInvites: number;
  featuresUsed: import("@boardstack/shared").TierFeature[];
  recommendedTier: import("@boardstack/shared").Tier;
};

export type AccountRow = {
  id: string;
  communityId: string;
  code: string;
  name: string;
  accountType: string;
  fundType: string;
  parentAccountId: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type JournalLineRow = {
  id: string;
  entryId: string;
  accountId: string;
  debitCents: number;
  creditCents: number;
  fundType: string;
  accountName: string | null;
  accountCode: string | null;
};

export type JournalEntryRow = {
  id: string;
  communityId: string;
  entryDate: string;
  memo: string;
  createdByUserId: string | null;
  postedAt: string;
  reversedByEntryId: string | null;
  lines?: JournalLineRow[];
};

export type JournalLineInput = {
  accountId: string;
  debitCents: number;
  creditCents: number;
};

export type ActivationRow = {
  communityId: string;
  rosterImported: boolean;
  reservePopulated: boolean;
  complianceAcknowledged: boolean;
  dueBatchConfigured: boolean;
};

export type ReserveComponentRow = {
  id: string;
  name: string;
  usefulLifeYears: number;
  remainingLifeYears: number;
  replacementCostCents: number;
  currentReserveCents: number;
};

export type StateRequirementsRow = {
  stateCode: string;
  stateName: string;
  reserveStudyRequired: boolean;
  minimumFundingPercent: number | null;
  statuteCitation: string | null;
};

export type ReserveSummaryRow = {
  studyId: string | null;
  effectiveDate: string | null;
  components: ReserveComponentRow[];
  totalReserveBalance: number;
  totalProjectedNeed: number;
  percentFunded: number | null;
  annualBudgetCents: number | null;
  annualReserveContributionCents: number | null;
  allocationPercent: number | null;
  fannieMaeCompliant: boolean | null;
  fannieMaeComplianceBasis:
    | "annual_budget_allocation"
    | "annual_budget_allocation_unavailable"
    | null;
  stateRequirements: StateRequirementsRow | null;
};

export type ReserveImportResult =
  | { inserted: number }
  | {
      inserted: number;
      errors: Array<{ row: number; field: string; message: string }>;
    };

export type UnitRow = {
  id: string;
  communityId: string;
  address: string;
  unitNumber: string | null;
  sqft: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type HomeownerRow = {
  id: string;
  communityId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  moveInDate: string | null;
  stripeCustomerId: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  unitId: string | null;
  unitNumber: string | null;
};

export type AssessmentRow = {
  id: string;
  communityId: string;
  unitId: string | null;
  period: string;
  amountCents: number;
  fundType: string;
  dueDate: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type AssessmentsResponse = {
  assessments: AssessmentRow[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type TrialBalanceRow = {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  fundType: "operating" | "reserve";
  debitCents: number;
  creditCents: number;
};

export type BalanceSheetRow = {
  accountType: string;
  fundType: "operating" | "reserve";
  balanceCents: number;
};

export type IncomeStatementRow = {
  fundType: "operating" | "reserve";
  revenue: number;
  expenses: number;
  netIncome: number;
};

export type LedgerRow = {
  id: string;
  entryDate: string;
  memo: string;
  accountCode: string;
  accountName: string;
  fundType: string;
  debitCents: number;
  creditCents: number;
  runningBalance: number;
};

export type BankStatementRow = {
  id: string;
  statementDate: string;
  beginningBalanceCents: number;
  endingBalanceCents: number;
  reconciliationId: string | null;
};

export type StatementLineRow = {
  id: string;
  postedDate: string;
  description: string;
  amountCents: number;
};

export type ReconciliationRow = {
  id: string;
  status: "open" | "finalized";
  statementId: string;
};

export type ReconciliationMatchRow = {
  id: string;
  reconciliationId: string;
  statementLineId: string;
  paymentId?: string | null;
  journalLineId?: string | null;
};

export type GovernanceMeeting = {
  id: string;
  communityId: string;
  title: string;
  meetingType: "annual" | "special" | "board";
  scheduledAt: string;
  location: string | null;
  minutesText: string | null;
  minutesFinalizedAt: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GovernanceMotion = {
  id: string;
  meetingId: string;
  communityId: string;
  text: string;
  movedByUserId: string | null;
  secondedByUserId: string | null;
  status: "pending" | "passed" | "failed" | "tabled";
  resolvedAt: string | null;
  createdAt: string;
};

export type GovernanceVote = {
  id: string;
  motionId: string;
  communityId: string;
  voterUserId: string;
  choice: "yes" | "no" | "abstain";
  notes: string | null;
  recordedAt: string;
};

export type GovernanceVoteTally = Partial<
  Record<GovernanceVote["choice"], number>
>;

export type GovernanceViolation = {
  id: string;
  communityId: string;
  unitId: string | null;
  homeownerId: string | null;
  title: string;
  description: string;
  status: "open" | "notified" | "cured" | "closed";
  createdByUserId: string | null;
  photoKeys?: string[] | null;
  createdAt: string;
  updatedAt: string;
};

export type GovernanceViolationEvent = {
  id: string;
  violationId: string;
  communityId: string;
  toStatus: GovernanceViolation["status"];
  note: string | null;
  actorUserId: string | null;
  occurredAt: string;
};

export type GovernanceArchRequest = {
  id: string;
  communityId: string;
  unitId: string | null;
  homeownerId: string | null;
  requestType: string;
  description: string;
  status: "pending" | "approved" | "approved_with_conditions" | "denied";
  reviewNote: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  attachmentKeys?: string[] | null;
  createdAt: string;
  updatedAt: string;
};

export type GovernanceBoardTransition = {
  id: string;
  communityId: string;
  role: string;
  fromUserId: string | null;
  toUserId: string | null;
  status: "pending" | "acknowledged" | "complete";
  pendingItems: string[] | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GovernanceHomeowner = {
  id: string;
  communityId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  moveInDate: string | null;
  unitId: string | null;
  unitNumber: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type HomeownerImportSkipReason =
  | "duplicate-in-upload"
  | "already-exists"
  | "invalid";

export type HomeownerImportSkippedRow = {
  row: number;
  email: string;
  reason: HomeownerImportSkipReason;
};

export type HomeownerImportResult = {
  created: number;
  skipped: HomeownerImportSkippedRow[];
};

async function importHomeowners(
  communityId: string,
  csv: string,
): Promise<HomeownerImportResult> {
  const path = `/governance/homeowners/import?communityId=${encodeURIComponent(communityId)}`;
  const res = await fetch(`${getApiBase()}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    method: "POST",
    body: csv,
  });
  const body = (await res.json().catch(() => ({}))) as Partial<
    HomeownerImportResult & ErrorBody
  >;
  if (!res.ok && Array.isArray(body.skipped)) {
    return {
      created: body.created ?? 0,
      skipped: body.skipped,
    };
  }
  if (!res.ok) {
    const { message, trackingId } = formatApiErrorMessage(body, res.status);
    throw new ApiError(message, res.status, path, trackingId);
  }
  return {
    created: body.created ?? 0,
    skipped: body.skipped ?? [],
  };
}

export type PortfolioRow = {
  id: string;
  name: string;
  ownerUserId: string;
};

export type CommunityRollup = {
  communityId: string;
  communityName: string;
  reservePctFunded: number | null;
  fannieMaeCompliant: boolean | null;
  fannieMaeComplianceBasis:
    | "annual_budget_allocation"
    | "annual_budget_allocation_unavailable"
    | null;
  overdueAssessmentsCents: number;
  lastCloseMonth: string | null;
};

export type MonthEndCloseRow = {
  id: string;
  periodYear: number;
  periodMonth: number;
  status: "open" | "complete";
  auditPackKey: string | null;
  startedAt: string;
};

export type CloseChecklistItem = {
  id: string;
  step: string;
  completed: boolean;
  completedAt: string | null;
};

export type { BillingStatusResponse as BillingStatus } from "@boardstack/shared";

export type AuthProviders = {
  google: boolean;
};

export type AiCsSessionRequest = {
  topic: string;
  pageUrl: string;
};

export type AiCsChatRequest = {
  sessionId: string;
  message: string;
};

export type AiCsEscalationRequest = {
  sessionId: string;
  reason: string;
};

export type AiCsResponse = Record<string, unknown>;

export const api = {
  auth: {
    providers: () => apiFetch<AuthProviders>("/api/auth/providers"),
  },
  communities: {
    list: () =>
      apiFetch<{ communities: Array<{ community: Community; role: string }> }>(
        "/communities/me",
      ),
    create: (data: { name: string; slug: string; state: string }) =>
      apiFetch<{ communityId: string }>("/communities", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    setup: (data: { communityId?: string; name?: string; state?: string }) =>
      apiFetch<{ ok: boolean }>("/communities/setup", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    invite: (communityId: string, email: string, role: string) =>
      apiFetch<{ token: string }>(
        `/communities/${encodeURIComponent(communityId)}/invitations`,
        { method: "POST", body: JSON.stringify({ email, role }) },
      ),
    acceptInvitation: (token: string) =>
      apiFetch<{ ok: boolean }>(
        `/invitations/${encodeURIComponent(token)}/accept`,
        { method: "POST" },
      ),
    usage: (communityId: string) =>
      apiFetch<CommunityUsageResponse>(
        `/communities/${encodeURIComponent(communityId)}/usage`,
      ),
  },
  activation: {
    get: (communityId: string) =>
      apiFetch<{ activation: ActivationRow }>(
        `/activation?communityId=${encodeURIComponent(communityId)}`,
      ),
    patch: (step: string, communityId: string, completed: boolean) =>
      apiFetch<{ ok: boolean }>(`/activation/${step}`, {
        method: "PATCH",
        body: JSON.stringify({ communityId, completed }),
      }),
  },
  finance: {
    accounts: {
      list: (communityId: string) =>
        apiFetch<{ accounts: AccountRow[] }>(
          `/finance/accounts?communityId=${encodeURIComponent(communityId)}`,
        ),
      create: (data: {
        communityId: string;
        code: string;
        name: string;
        accountType: string;
        fundType: string;
        parentAccountId?: string | null;
      }) =>
        apiFetch<{ accountId: string }>("/finance/accounts", {
          method: "POST",
          body: JSON.stringify(data),
        }),
      update: (
        id: string,
        data: {
          communityId: string;
          name?: string;
          active?: boolean;
          parentAccountId?: string | null;
        },
      ) =>
        apiFetch<{ ok: boolean }>(`/finance/accounts/${id}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        }),
    },
    reserves: {
      getSummary: (communityId: string) =>
        apiFetch<ReserveSummaryRow>(
          `/finance/reserves/summary?communityId=${encodeURIComponent(communityId)}`,
        ),
      upsertStudy: (data: {
        communityId: string;
        effectiveDate: string;
        methodology?: string;
        notes?: string;
        annualBudgetCents?: number;
        annualReserveContributionCents?: number;
        components: Array<{
          name: string;
          usefulLifeYears: number;
          remainingLifeYears: number;
          replacementCostCents: number;
          currentReserveCents: number;
        }>;
      }) =>
        apiFetch<ReserveSummaryRow>("/finance/reserves/study", {
          method: "PUT",
          body: JSON.stringify(data),
        }),
      updateAllocation: (data: {
        communityId: string;
        annualBudgetCents: number;
        annualReserveContributionCents: number;
      }) =>
        apiFetch<ReserveSummaryRow>("/finance/reserves/allocation", {
          method: "PATCH",
          body: JSON.stringify(data),
        }),
      importStudy: (communityId: string, file: File, contentType: string) =>
        apiFetch<ReserveImportResult>(
          `/finance/reserve-study/import?communityId=${encodeURIComponent(communityId)}`,
          {
            method: "POST",
            headers: { "Content-Type": contentType },
            body: file,
          },
        ),
    },
    dues: {
      listUnits: (communityId: string) =>
        apiFetch<{ units: UnitRow[] }>(
          `/finance/units?communityId=${encodeURIComponent(communityId)}`,
        ),
      createUnit: (data: {
        communityId: string;
        address: string;
        unitNumber?: string;
        sqft?: number;
      }) =>
        apiFetch<{ unitId: string }>("/finance/units", {
          method: "POST",
          body: JSON.stringify(data),
        }),
      listHomeowners: (communityId: string) =>
        apiFetch<{ homeowners: HomeownerRow[] }>(
          `/finance/homeowners?communityId=${encodeURIComponent(communityId)}`,
        ),
      createHomeowner: (data: {
        communityId: string;
        firstName: string;
        lastName: string;
        email: string;
        phone?: string;
        moveInDate?: string;
      }) =>
        apiFetch<{ homeownerId: string }>("/finance/homeowners", {
          method: "POST",
          body: JSON.stringify(data),
        }),
      listAssessments: (
        communityId: string,
        period?: string,
        params?: { limit?: number; offset?: number },
      ) => {
        const qs = new URLSearchParams({ communityId });
        if (period) qs.set("period", period);
        if (params?.limit !== undefined) qs.set("limit", String(params.limit));
        if (params?.offset !== undefined)
          qs.set("offset", String(params.offset));
        return apiFetch<AssessmentsResponse>(`/finance/assessments?${qs}`);
      },
      createAssessment: (data: {
        communityId: string;
        unitId: string;
        period: string;
        amountCents: number;
        fundType: "operating" | "reserve";
        dueDate: string;
      }) =>
        apiFetch<{ assessmentId: string }>("/finance/assessments", {
          method: "POST",
          body: JSON.stringify(data),
        }),
      createAssessmentBatch: (data: {
        communityId: string;
        unitIds: string[];
        period: string;
        amountCents: number;
        fundType: "operating" | "reserve";
        dueDate: string;
      }) =>
        apiFetch<{ assessmentIds: string[] }>("/finance/assessments/batch", {
          method: "POST",
          body: JSON.stringify(data),
        }),
      pay: (data: {
        communityId: string;
        assessmentId: string;
        homeownerId: string;
        amountCents: number;
        method: "ach" | "card" | "check" | "other";
        successUrl?: string;
        cancelUrl?: string;
      }) =>
        apiFetch<
          | { paymentId: string }
          | { clientSecret: string; paymentIntentId: string }
        >("/finance/dues/pay", {
          method: "POST",
          body: JSON.stringify(data),
        }),
    },
    journal: {
      list: (
        communityId: string,
        params?: { limit?: number; offset?: number },
      ) => {
        const qs = new URLSearchParams({
          communityId,
          ...(params?.limit !== undefined
            ? { limit: String(params.limit) }
            : {}),
          ...(params?.offset !== undefined
            ? { offset: String(params.offset) }
            : {}),
        });
        return apiFetch<{
          entries: JournalEntryRow[];
          limit: number;
          offset: number;
        }>(`/finance/journal?${qs.toString()}`);
      },
      get: (entryId: string, communityId: string) =>
        apiFetch<{ entry: JournalEntryRow; lines: JournalLineRow[] }>(
          `/finance/journal/${entryId}?communityId=${encodeURIComponent(communityId)}`,
        ),
      create: (data: {
        communityId: string;
        entryDate: string;
        memo: string;
        lines: JournalLineInput[];
      }) =>
        apiFetch<{ entryId: string; lineCount: number }>("/finance/journal", {
          method: "POST",
          body: JSON.stringify(data),
        }),
    },
  },
  reports: {
    trialBalance: (communityId: string, asOf: string) =>
      apiFetch<{ rows: TrialBalanceRow[] }>(
        `/reports/trial-balance?communityId=${encodeURIComponent(communityId)}&asOf=${encodeURIComponent(asOf)}`,
      ),
    balanceSheet: (communityId: string, asOf: string) =>
      apiFetch<{ rows: BalanceSheetRow[] }>(
        `/reports/balance-sheet?communityId=${encodeURIComponent(communityId)}&asOf=${encodeURIComponent(asOf)}`,
      ),
    incomeStatement: (communityId: string, from: string, to: string) =>
      apiFetch<{ rows: IncomeStatementRow[] }>(
        `/reports/income-statement?communityId=${encodeURIComponent(communityId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
    generalLedger: (
      communityId: string,
      from: string,
      to: string,
      accountId?: string,
      fundType?: string,
    ) => {
      const qs = new URLSearchParams({ communityId, from, to });
      if (accountId) qs.set("accountId", accountId);
      if (fundType) qs.set("fundType", fundType);
      return apiFetch<{ rows: LedgerRow[] }>(
        `/reports/general-ledger?${qs.toString()}`,
      );
    },
    downloadAuditPack: (
      communityId: string,
      periodStart: string,
      periodEnd: string,
    ) =>
      downloadBlob(
        "/reports/audit-pack",
        { communityId, periodStart, periodEnd },
        `audit-pack-${periodEnd}.zip`,
      ),
    downloadRoleHandoff: (communityId: string, transitionId: string) =>
      downloadBlob(
        "/reports/role-handoff",
        { communityId, transitionId },
        `role-handoff-${transitionId}.pdf`,
      ),
  },
  bank: {
    listStatements: (communityId: string) =>
      apiFetch<{ statements: BankStatementRow[] }>(
        `/bank/statements?communityId=${encodeURIComponent(communityId)}`,
      ),
    importStatement: (data: {
      communityId: string;
      accountId: string;
      beginningBalanceCents: number;
      endingBalanceCents: number;
      statementDate: string;
      csv: string;
    }) =>
      apiFetch<{ statementId: string }>("/bank/statements", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    getReconciliation: (id: string, communityId: string) =>
      apiFetch<{
        reconciliation: ReconciliationRow;
        lines: StatementLineRow[];
        matches: ReconciliationMatchRow[];
      }>(
        `/bank/reconciliations/${id}?communityId=${encodeURIComponent(communityId)}`,
      ),
    addMatch: (
      reconciliationId: string,
      data: {
        communityId: string;
        reconciliationId?: string;
        statementLineId: string;
        paymentId: string | null;
        journalLineId: string | null;
      },
    ) =>
      apiFetch<{ match?: ReconciliationMatchRow; matchId?: string }>(
        `/bank/reconciliations/${reconciliationId}/matches`,
        {
          method: "POST",
          body: JSON.stringify({ ...data, reconciliationId }),
        },
      ),
    deleteMatch: (
      reconciliationId: string,
      matchId: string,
      communityId: string,
    ) =>
      apiFetch<{ ok: boolean }>(
        `/bank/reconciliations/${reconciliationId}/matches/${matchId}?communityId=${encodeURIComponent(communityId)}`,
        { method: "DELETE" },
      ),
    finalizeReconciliation: (id: string, communityId: string) =>
      apiFetch<{
        ok: boolean;
        reconciliationId: string;
        status: "finalized";
      }>(`/bank/reconciliations/${id}/finalize`, {
        method: "POST",
        body: JSON.stringify({ communityId, reconciliationId: id }),
      }),
  },
  portfolio: {
    list: () => apiFetch<{ portfolios: PortfolioRow[] }>("/portfolio"),
    create: (name: string) =>
      apiFetch<{ portfolioId: string; name?: string }>("/portfolio", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    rename: (id: string, name: string) =>
      apiFetch<{ portfolio: PortfolioRow }>(`/portfolio/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    delete: (id: string) =>
      apiFetch<{ ok: boolean }>(`/portfolio/${id}`, { method: "DELETE" }),
    linkCommunity: (portfolioId: string, communityId: string) =>
      apiFetch<{ ok: boolean }>(`/portfolio/${portfolioId}/communities`, {
        method: "POST",
        body: JSON.stringify({ portfolioId, communityId }),
      }),
    unlinkCommunity: (portfolioId: string, communityId: string) =>
      apiFetch<{ ok: boolean }>(
        `/portfolio/${portfolioId}/communities/${communityId}`,
        { method: "DELETE" },
      ),
    getRollup: (portfolioId: string) =>
      apiFetch<{ portfolioId: string; communities: CommunityRollup[] }>(
        `/portfolio/${portfolioId}/rollup`,
      ),
  },
  close: {
    list: (communityId: string) =>
      apiFetch<{ closes: MonthEndCloseRow[] }>(
        `/close?communityId=${encodeURIComponent(communityId)}`,
      ),
    start: (communityId: string, periodYear: number, periodMonth: number) =>
      apiFetch<{ closeId: string }>("/close/start", {
        method: "POST",
        body: JSON.stringify({ communityId, periodYear, periodMonth }),
      }),
    advanceStep: (
      closeId: string,
      communityId: string,
      step: string,
      completed: boolean,
    ) =>
      apiFetch<{ ok: boolean }>(`/close/${closeId}/steps/${step}`, {
        method: "PATCH",
        body: JSON.stringify({ communityId, closeId, step, completed }),
      }),
    complete: (closeId: string, communityId: string) =>
      apiFetch<{
        closeId: string;
        status: "complete";
        auditPackKey: string | null;
      }>(`/close/${closeId}/complete`, {
        method: "POST",
        body: JSON.stringify({ communityId }),
      }),
    auditPackUrl: (closeId: string, communityId: string) =>
      `${getApiBase()}/close/${encodeURIComponent(closeId)}/pack-url?communityId=${encodeURIComponent(communityId)}`,
    getChecklist: (closeId: string, communityId: string) =>
      apiFetch<{ items: CloseChecklistItem[] }>(
        `/close/${closeId}/checklist?communityId=${encodeURIComponent(communityId)}`,
      ),
  },
  feedback: {
    submit: (data: { category: string; message: string; pageUrl: string }) =>
      apiFetch<{ ok: boolean }>("/api/feedback", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
  aiCs: {
    startSession: (data: AiCsSessionRequest) =>
      apiFetch<AiCsResponse>("/api/ai-cs/session", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    chat: (data: AiCsChatRequest) =>
      apiFetch<AiCsResponse>("/api/ai-cs/chat", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    escalate: (data: AiCsEscalationRequest) =>
      apiFetch<AiCsResponse>("/api/ai-cs/escalation", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
  billing: {
    getStatus: (communityId: string) =>
      apiFetch<BillingStatusResponse>(
        `/billing/status?communityId=${encodeURIComponent(communityId)}`,
      ),
    startTrial: (data: {
      communityId: string;
      tier?: string;
      cycle?: string;
    }) =>
      apiFetch<BillingStatusResponse>("/billing/start-trial", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    checkout: (data: {
      communityId: string;
      tier: string;
      cycle: string;
      successUrl: string;
      cancelUrl: string;
    }) =>
      apiFetch<{ url: string | null }>("/billing/checkout", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    portal: (communityId: string, returnUrl: string) =>
      apiFetch<{ url: string }>("/billing/portal", {
        method: "POST",
        body: JSON.stringify({ communityId, returnUrl }),
      }),
    cancel: (communityId: string, reason: string, note?: string) =>
      apiFetch<{ ok: boolean; cancelAtPeriodEnd?: boolean }>(
        "/billing/cancel",
        {
          method: "POST",
          body: JSON.stringify({ communityId, reason, note }),
        },
      ),
  },
  governance: {
    homeowners: {
      list: (communityId: string, search?: string) =>
        apiFetch<{ homeowners: GovernanceHomeowner[] }>(
          `/governance/homeowners?communityId=${encodeURIComponent(communityId)}${search ? `&search=${encodeURIComponent(search)}` : ""}`,
        ),
      import: importHomeowners,
      add: (
        communityId: string,
        data: {
          firstName: string;
          lastName: string;
          email: string;
          unitNumber?: string;
          phone?: string;
          moveInDate?: string;
        },
      ) =>
        apiFetch<{
          homeowner: {
            id: string;
            firstName: string;
            lastName: string;
            email: string;
            unitNumber: string | null;
            phone: string | null;
            moveInDate: string | null;
          };
        }>(`/communities/${encodeURIComponent(communityId)}/homeowners`, {
          method: "POST",
          body: JSON.stringify(data),
        }),
    },
    meetings: {
      list: (communityId: string) =>
        apiFetch<{ meetings: GovernanceMeeting[] }>(
          `/governance/meetings?communityId=${encodeURIComponent(communityId)}`,
        ),
      create: (data: {
        communityId: string;
        title: string;
        meetingType: "annual" | "special" | "board";
        scheduledAt: string;
        location?: string;
      }) =>
        apiFetch<{ meeting: GovernanceMeeting }>("/governance/meetings", {
          method: "POST",
          body: JSON.stringify(data),
        }),
      recordMinutes: (id: string, minutesText: string, finalize: boolean) =>
        apiFetch<{ meeting: GovernanceMeeting }>(
          `/governance/meetings/${encodeURIComponent(id)}/minutes`,
          {
            method: "PATCH",
            body: JSON.stringify({ minutesText, finalize }),
          },
        ),
      listMotions: (meetingId: string) =>
        apiFetch<{ motions: GovernanceMotion[] }>(
          `/governance/meetings/${encodeURIComponent(meetingId)}/motions`,
        ),
      createMotion: (meetingId: string, text: string) =>
        apiFetch<{ motion: GovernanceMotion }>(
          `/governance/meetings/${encodeURIComponent(meetingId)}/motions`,
          {
            method: "POST",
            body: JSON.stringify({ text }),
          },
        ),
      resolveMotion: (
        motionId: string,
        status: "passed" | "failed" | "tabled",
      ) =>
        apiFetch<{ motion: GovernanceMotion }>(
          `/governance/motions/${encodeURIComponent(motionId)}/resolve`,
          {
            method: "PATCH",
            body: JSON.stringify({ status }),
          },
        ),
      castVote: (
        motionId: string,
        choice: GovernanceVote["choice"],
        notes?: string,
      ) =>
        apiFetch<{ vote: GovernanceVote }>(
          `/governance/motions/${encodeURIComponent(motionId)}/votes`,
          {
            method: "POST",
            body: JSON.stringify({ choice, notes }),
          },
        ),
      listVotes: (motionId: string) =>
        apiFetch<{ votes: GovernanceVote[]; tally: GovernanceVoteTally }>(
          `/governance/motions/${encodeURIComponent(motionId)}/votes`,
        ),
    },
    violations: {
      list: (communityId: string) =>
        apiFetch<{ violations: GovernanceViolation[] }>(
          `/governance/violations?communityId=${encodeURIComponent(communityId)}`,
        ),
      create: (data: {
        communityId: string;
        unitId?: string;
        homeownerId?: string;
        title: string;
        description: string;
      }) =>
        apiFetch<{ violation: GovernanceViolation }>("/governance/violations", {
          method: "POST",
          body: JSON.stringify(data),
        }),
      updateStatus: (id: string, status: string, note?: string) =>
        apiFetch<{ violation: GovernanceViolation }>(
          `/governance/violations/${encodeURIComponent(id)}/status`,
          { method: "PATCH", body: JSON.stringify({ status, note }) },
        ),
      listEvents: (id: string) =>
        apiFetch<{ events: GovernanceViolationEvent[] }>(
          `/governance/violations/${encodeURIComponent(id)}/events`,
        ),
      uploadPhoto: (id: string, file: File) =>
        apiFetch<{ key: string; violation: GovernanceViolation }>(
          `/governance/violations/${encodeURIComponent(id)}/photos`,
          {
            method: "POST",
            headers: {
              "Content-Type": file.type || "application/octet-stream",
            },
            body: file,
          },
        ),
    },
    archRequests: {
      list: (communityId: string) =>
        apiFetch<{ archRequests: GovernanceArchRequest[] }>(
          `/governance/arch-requests?communityId=${encodeURIComponent(communityId)}`,
        ),
      create: (data: {
        communityId: string;
        requestType: string;
        description: string;
      }) =>
        apiFetch<{ archRequest: GovernanceArchRequest }>(
          "/governance/arch-requests",
          {
            method: "POST",
            body: JSON.stringify(data),
          },
        ),
      review: (id: string, status: string, reviewNote?: string) =>
        apiFetch<{ archRequest: GovernanceArchRequest }>(
          `/governance/arch-requests/${encodeURIComponent(id)}/review`,
          { method: "PATCH", body: JSON.stringify({ status, reviewNote }) },
        ),
      uploadAttachment: (id: string, file: File) =>
        apiFetch<{ key: string; archRequest: GovernanceArchRequest }>(
          `/governance/arch-requests/${encodeURIComponent(id)}/attachments`,
          {
            method: "POST",
            headers: {
              "Content-Type": file.type || "application/octet-stream",
            },
            body: file,
          },
        ),
    },
    transitions: {
      list: (communityId: string) =>
        apiFetch<{ transitions: GovernanceBoardTransition[] }>(
          `/governance/transitions?communityId=${encodeURIComponent(communityId)}`,
        ),
      acknowledge: (id: string) =>
        apiFetch<{ transition: GovernanceBoardTransition }>(
          `/governance/transitions/${encodeURIComponent(id)}/acknowledge`,
          { method: "PATCH" },
        ),
      complete: (id: string) =>
        apiFetch<{ transition: GovernanceBoardTransition }>(
          `/governance/transitions/${encodeURIComponent(id)}/complete`,
          { method: "PATCH" },
        ),
    },
    portal: {
      createSession: (
        communityId: string,
        homeownerId: string,
        options?: { sendEmail?: boolean },
      ) =>
        apiFetch<{ token: string; expiresAt: string; sent: boolean }>(
          "/owner/sessions",
          {
            method: "POST",
            body: JSON.stringify({
              communityId,
              homeownerId,
              ...(options?.sendEmail ? { sendEmail: true } : {}),
            }),
          },
        ),
    },
  },
};

export type OwnerPortalMe = {
  homeowner: {
    id: string;
    firstName: string;
    lastName: string;
    unitNumber: string | null;
    email: string | null;
  };
  assessments: Array<{
    id: string;
    description: string;
    amountCents: number;
    dueDate: string | null;
    status: string;
  }>;
};

export type OwnerPortalArchRequest = {
  id: string;
  requestType: string;
  description: string | null;
  status: string;
  createdAt: string;
};

export type CreateOwnerPortalArchRequestInput = {
  requestType: string;
  description: string;
  unitId?: string;
};

async function ownerPortalFetch<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: { "x-owner-token": token, "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await parseErrorBody(res, "Unknown error");
    const { message, trackingId } = formatApiErrorMessage(body, res.status);
    throw new ApiError(message, res.status, path, trackingId);
  }
  return res.json() as Promise<T>;
}

export const ownerPortalApi = {
  getMe: (token: string) => ownerPortalFetch<OwnerPortalMe>("/owner/me", token),
  getArchRequests: (token: string) =>
    ownerPortalFetch<{ archRequests: OwnerPortalArchRequest[] }>(
      "/owner/arch-requests",
      token,
    ),
  createArchRequest: (token: string, data: CreateOwnerPortalArchRequestInput) =>
    ownerPortalFetch<{ archRequest: OwnerPortalArchRequest }>(
      "/owner/arch-requests",
      token,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    ),
  payDues: (
    token: string,
    data: {
      assessmentId: string;
      amountCents: number;
      method: "ach" | "card";
    },
  ) =>
    ownerPortalFetch<{
      checkoutUrl: string | null;
      paymentIntentId: string | null;
    }>("/owner/dues/pay", token, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
