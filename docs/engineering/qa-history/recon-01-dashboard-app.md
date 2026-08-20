# Dashboard App (apps/app) Recon: Defect Report

## Summary

The React 19 + Vite + TanStack Router dashboard app is well-structured with good component design and responsive nav. However, critical defects exist in mutation error handling, missing success feedback notifications, and several mutations that silently fail without user feedback. All route files exist and are properly linked. **Critical: 1 | High: 5 | Medium: 3 | Low: 4**

---

## CRITICAL (Blocking)

**1. EditAccountDialog (finance/accounts): Missing error handling & success toast**
- File: src/routes/_app.finance.accounts.tsx:44-54
- Issue: updateMutation has no onError callback and no toast.success() on success. Error displays inline but users get no feedback when saves complete.
- Impact: Users won't know if account name saves or why it failed. No success confirmation.
- Fix: Add onError: (err) => toast.error(...) and onSuccess: () => toast.success(...) callbacks.

---

## HIGH (Major Functionality Gap)

**1. Finance Routes: No toast error notifications on mutations**
- Files: _app.finance.dues.tsx, _app.finance.journal.tsx, _app.finance.reserves.tsx
- Issue: Mutations for dues, journal entries, reserves lack toast.error() in onError callbacks. Errors shown inline only or swallowed silently.
- Impact: Users don't get clear feedback when financial operations fail.

**2. Governance Routes: Inconsistent error handling**
- Files: _app.governance.arch-requests.tsx, _app.governance.violations.tsx, _app.governance.meetings.tsx
- Issue: Create/update/delete mutations lack consistent toast error handling.
- Impact: Governance workflow failures are silently lost.

**3. Bank Reconcile/Statements Routes: No error feedback**
- Files: _app.bank.reconcile.tsx, _app.bank.statements.tsx
- Issue: File upload and mutation operations lack toast notifications.
- Impact: Import/reconcile failures go unnoticed.

**4. Portfolio Mutations: Missing success toasts**
- File: src/routes/_app.portfolio.index.tsx:122-135
- Issue: renameMutation, deleteMutation, linkCommunityMutation only invalidate queries. No toast.success() feedback. Delete and rename have no confirmation.
- Impact: Users don't know if rename/delete/link completed.
- Fix: Add toast.success() callbacks to all mutations.

**5. CancelReasonModal: Missing toast error feedback**
- File: src/components/billing/CancelReasonModal.tsx:59-72
- Issue: handleSubmit catches errors and sets state but doesn't call toast.error(). Error shown in Alert but user may miss it.
- Impact: Users must manually discover cancellation failures.
- Fix: Add toast.error() and toast.success() with auto-close on completion.

---

## MEDIUM (Usability)

**1. EditAccountDialog: No success message**
- File: src/routes/_app.finance.accounts.tsx:44-54
- Issue: Mutation onSuccess() closes dialog but provides no toast feedback.
- Impact: User sees dialog close but no confirmation message.
- Fix: Add toast.success("Account updated.") before closing.

**2. Form validation feedback gaps**
- File: src/routes/_app.settings.tsx
- Issue: communityForm, passwordForm, inviteForm show FormMessage for validation errors but mutations may not reject with clear messages.
- Note: Settings page overall has good error handling (lines 179-181, 195-200, 163-166).

**3. Close (Month-End) Page: Incomplete async error handling**
- File: src/routes/_app.close.tsx:71-88
- Issue: handleStartClose() has try/finally but no catch or error toast. Close start failures are silent.
- Impact: Users see spinner stop but no error message.
- Fix: Add catch block with toast.error() and error state.

---

## LOW (Polish/Edge Cases)

**1. Navigation coverage: No nav links for setup or owner routes**
- Files: src/routes/setup.tsx, owner.tsx, owner.index.tsx
- Status: By design for auth flows. Not a defect.

**2. Reports pages: Loading states lack error branches**
- Files: _app.reports.balance-sheet.tsx, _app.reports.income-statement.tsx, _app.reports.general-ledger.tsx, _app.reports.trial-balance.tsx
- Issue: useQuery has no isError branch. Report API failures show loading spinner indefinitely or blank page.
- Impact: Report failures are opaque.
- Fix: Add error detection and user-facing error boundary.

**3. Portfolio rollup rename: Mutation state clearing timing**
- File: src/routes/_app.portfolio.index.tsx:177-181
- Issue: handleCommitRename() clears renamingId before error can be shown, though error displays via setMembershipError.
- Status: Low priority; error displayed in dedicated area.

**4. Missing loader patterns in multi-step flows**
- Files: Finance and Governance routes
- Issue: Some forms may not disable submit button while mutation pending.
- Observation: Most correctly use disabled={mutation.isPending}.

---

## Missing Features / Incomplete Pages

None identified. All major routes exist and are functional:
- Dashboard, Finance (all modules), Banking, Reports (all types), Governance (all modules), Portfolio, Billing, Settings, Help, Auth flows, Owner portal

---

## Summary by Severity

- Critical: 1: Account edit mutation lacks all feedback
- High: 5: Missing toast notifications in finance, governance, banking, portfolio, billing
- Medium: 3: Form validation, close async error, UX gaps
- Low: 4: Reports error states, portfolio UX, button states
- Total Findings: 13

---

## Quality Gates Status

✓ No TODO/FIXME/HACK comments
✓ No href="#" or empty onClick handlers
✓ No placeholder strings ("Coming soon", "TBD", Lorem)
✓ No hardcoded API URLs (uses lib/api.ts)
✓ No any casts or @ts-ignore
✓ No eslint-disable without reason
✓ Routes and nav aligned
✓ Empty states present on list pages
⚠ Error handling: Multiple mutations missing toast feedback
✓ Form validation working
✓ Loading states in most places (missing in reports)
