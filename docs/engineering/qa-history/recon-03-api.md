# API Reconnaissance: Gavelhouse Hono API

## Endpoint Inventory (65 total)

**Auth:** GET /api/auth/providers, */api/auth/* (Better Auth delegation)  
**Communities:** GET/POST /communities, PATCH /communities/setup, POST /communities/:id/invitations, POST /invitations/:token/accept  
**Billing:** GET /billing/limited-offer (public), GET /billing/status, POST /billing/start-trial, /checkout, /portal, /webhook, /cancel  
**Finance:** GET/POST /finance/accounts, POST /finance/journal, GET /finance/journal (paginated), GET/POST /finance/units, /homeowners, /assessments, POST /finance/reserves/**  
**Bank:** GET /bank/reconciliations/:id, POST /bank/reconciliations/:id/matches, POST /bank/statements, GET /bank/statements  
**Governance:** GET/POST /governance/homeowners (+ CSV), /meetings, /violations (+ photos), /arch-requests (+ attachments)  
**Reports:** GET /reports/balance-sheet, /income-statement, /general-ledger, /trial-balance, /audit-pack, /role-handoff  
**Portfolio:** GET/POST /portfolio, PATCH /portfolio/:id, DELETE /portfolio/:id, POST /portfolio/:id/members  
**Close:** POST/PATCH/GET /close  
**Lead Magnets (public):** POST /lead-magnets/subscribe, /survey, /pricing-click, GET /downloads/:filename  
**AI:** GET /api/ai-sdr/context (HMAC-signed), POST /api/ai-cs/*  
**Other:** GET /activation, PATCH /activation/:step, GET /communities/:id/usage, POST /feedback, /unsubscribe/:token

## Critical Defects (5)

1. **NO RATE LIMITING ON AUTH ENDPOINTS** (apps/api/src/routes/auth.ts)
   - Risk: Brute force, user enumeration, DoS Resend
   - Fix: Per-email limit 5/15min on /api/auth/signin, /signup, /password-reset

2. **INVITATION ACCEPTANCE MISSING EMAIL VERIFICATION** (apps/api/src/routes/communities.ts:241-346)
   - Risk: Unconfirmed email accepts invitation for different address
   - Fix: Check session.user.emailVerified === true

3. **DUE PAYMENTS POSTED WITH NULL ACTOR** (apps/api/src/routes/billing/dues-webhook.ts:105)
   - Risk: Audit trail lacks actor attribution
   - Fix: Use system user ID constant instead of null

4. **FINANCIAL REPORTS MISSING PAGINATION** (apps/api/src/routes/reports/**)
   - Risk: 10k+ rows cause memory exhaustion, timeout
   - Fix: Add limit/offset, max 200 rows per request

5. **BANK STATEMENT UPLOAD NO FILE VALIDATION** (apps/api/src/routes/bank/statements.ts)
   - Risk: No content-type/size check; massive binary uploads
   - Fix: Validate text/csv, 10MB max, sanitize filename

## High Priority (5)

6. **PORTFOLIO NO TIER FEATURE GATE**: Starter tier can access premium features
7. **INVITATIONS NOT RATE-LIMITED**: Owner can spam thousands; DoS Resend
8. **CORS MISCONFIGURATION RISK**: localhost auto-added if APP_URL check fails
9. **STRIPE WEBHOOK NO DEFAULT CASE**: Unhandled event types silently pass
10. **HOMEOWNER IMPORT NO DEDUPLICATION**: Duplicates → constraint errors, not user errors

## Medium Priority (8)

11. Money handling (cents/dollars) not schema-enforced
12. Journal posting not wrapped in transaction
13. Pagination allows unbounded offsets
14. Activation revert has no downstream validation
15. AI CS proxy auth mechanism unclear
16. Better Auth email not verified before login
17. Rate limits in-memory only (not persistent across deploys)
18. Community setup patch has TOCTOU race (read → update)

## Low Priority (5)

19. Missing DELETE /communities/:id endpoint
20. Hardcoded account codes assume default chart
21. Audit trail coverage undocumented
22. No soft-delete pattern (breaks legal hold)
23. Missing indices on foreign keys

## Schema Health

**Good:** Cascade deletes, audit table, type-safe ORM, citext indices  
**Gaps:** No immutable audit constraint, in-memory rate limits, no idempotency keys for Stripe

## Summary

| Priority | Count |
|----------|-------|
| Critical | 5 |
| High | 5 |
| Medium | 8 |
| Low | 5 |

**Total Issues:** 23  
**Files Analyzed:** auth.ts, communities.ts, billing.ts, dues-webhook.ts, journal.ts, dues.ts, reconciliations.ts, activation.ts, downloads.ts, leadMagnet.ts, aiSdrContext.ts, index.ts

