# Generic audit middleware

Most audit trails in small backends are bolted on route by route: a call to
`logAudit(...)` at the end of every handler, added when someone remembers to
add it. That approach rots. A new endpoint ships, the audit call gets
forgotten, and the gap isn't discovered until a board dispute needs a record
that doesn't exist.

Gavelhouse's API takes a different approach for the routes where an audit
trail actually matters: finance, governance, owner actions, bank
reconciliation, month-end close, and portfolio management. A single Hono
middleware, [`apps/api/src/domain/accounting/auditMiddleware.ts`](../apps/api/src/domain/accounting/auditMiddleware.ts),
is mounted in front of those route groups. No route handler calls an audit
function. The middleware infers what happened from the HTTP request and
response themselves.

## How it's mounted

[`apps/api/src/index.ts`](../apps/api/src/index.ts) wires the middleware
in front of each protected route group, before the router for that group is
attached:

```ts
app.use("/finance/*", createAuditMiddleware(createDb));
app.route("/", financeAccountsRouter);
...
app.use("/governance/*", createAuditMiddleware(createDb));
app.use("/owner/*", createAuditMiddleware(createDb));
app.use("/bank/*", createAuditMiddleware(createDb));
app.use("/close/*", createAuditMiddleware(createDb));
app.route("/", governanceRouter);
...
app.use("/portfolio/*", createAuditMiddleware(createDb));
app.route("/", portfolioRouter);
```

Adding a new mutating endpoint under one of these path prefixes gets an audit
row for free. There is nothing to remember.

## Inference, not instrumentation

Three small functions do the actual work, all keyed off information that's
already in the request: a URL, an HTTP verb, and a JSON body.

**Entity type from the path.** `deriveEntityType` splits the pathname and
matches on the area/resource segments:

```ts
function deriveEntityType(pathname: string): string {
  const segments = pathname.split("/");
  const area = segments[1];
  const resource = segments[2];
  const nestedResource = segments[4] ?? segments[3];
  if (area === "finance") {
    if (resource === "accounts") return "account";
    if (resource === "journal") return "journalEntry";
    ...
```

It has to handle the same resource name meaning different things depending on
where it's nested: `dues` maps to `"payment"` only when the next segment is
`pay`, otherwise it's `"assessment"`; `meetings` maps to `"motion"` only when
nested under `motions`. This is the part of the design most exposed to
silent drift: if a route is renamed or restructured, the string match breaks
quietly and the middleware falls through to `entityType === ""`, which is
treated as "don't audit this" (see below).

**Action from the HTTP verb.** `deriveAction` is a straight map: `POST` to
`create`, `PATCH`/`PUT` to `update`, `DELETE` to `delete`, everything else
(`GET`) returns `null` and the middleware skips entirely. `post` and
`reverse` are also defined in the `audit_action` Postgres enum in
[`apps/api/src/db/schema/audit.ts`](../apps/api/src/db/schema/audit.ts),
but `insertAuditEvent` is only ever called from inside this middleware, and
this middleware's `deriveAction` never produces those two values, so as
written, no code path currently writes an audit row with action `post` or
`reverse`. They read as reserved for a more granular accounting-specific
audit call that was never built.

**IDs from the body.** `deriveEntityId` and `deriveCommunityId` walk an
unknown JSON object recursively, looking for a small set of known key names
(`id`, `entryId`, `reconciliationId` for entity; `communityId` for tenant).
If the top-level object doesn't have the key, they recurse into every nested
value until they find one or exhaust the object.

## Reading the body without breaking the downstream validator

The hard constraint: route handlers are wrapped in `zValidator`, which reads
`c.req.json()` and caches the parsed result. A `Request` body is a stream,
consumed once. If the middleware read `c.req.raw` directly, the validator
downstream would get an empty stream and fail.

The middleware sidesteps this with `Request.clone()`:

```ts
try {
  const clonedReq = c.req.raw.clone();
  const reqBody = (await clonedReq.json()) as unknown;
  communityId = deriveCommunityId(reqBody);
} catch {
  // body may not be JSON — fall through to query param
}
```

`clone()` on the Fetch API `Request` duplicates the underlying stream before
anything consumes it, so the middleware can drain its clone for
`communityId` while leaving the original body intact for the validator that
runs inside `next()`. The same trick is used on the way out (`c.res.clone()`)
to read the response body for `entityId` and a `communityId` fallback
after the handler has already sent its own response.

The middleware runs its "before" work first (clone and read the request body,
extracting `communityId` if present), then calls `await next()` to run the
actual handler, then does its "after" work using the response.

## Failure isolation

Two failure paths are deliberately swallowed rather than propagated:

- If a session lookup for `actorUserId` throws, `actorUserId` stays `null`
  and the response still goes out: an audit-metadata failure must not
  block a real user action.
- The insert itself runs through `insertAuditEvent`, which wraps the insert
  in `try/catch` and reports failures to Sentry via `captureException` rather
  than throwing:

```ts
try {
  await db.insert(auditEvents).values({ ... });
} catch (err) {
  captureException(err, {
    tags: { source: "audit-event-insert" },
    extra: { action: event.action, entityType: event.entityType },
  });
}
```

The call is also fired with `void insertAuditEvent(...)`, not awaited, so a
slow audit insert cannot add latency to the response the client already
received. The tradeoff is explicit: an audit-log outage degrades to
"missing rows," never to "broken product."

## What this cannot capture

- **Reads are never audited.** `deriveAction` returns `null` for `GET`, so
  there is no record of who viewed a financial report or a homeowner's
  record, only who changed something.
- **No before/after diff.** The `diffJson` column exists on
  [`apps/api/src/db/schema/audit.ts`](../apps/api/src/db/schema/audit.ts)
  but the middleware's call to `insertAuditEvent` never passes a `diffJson`
  value, so every row from this path has it `null`. It would take a
  pre-handler read of the current row to populate a real diff, which the
  middleware doesn't do.
- **String-matching is brittle.** The entity-type and ID inference depend on
  URL shape and body field names holding steady. `apps/api/__tests__/domain/auditMiddleware.test.ts`
  does enumerate the known route families and assert each maps to a
  non-empty entity type, but that list is a hardcoded set of paths inside
  the test file, not a read of the live route table. A real route whose
  registered path or response shape drifts from what the test hardcodes
  will not fail CI. It will just silently start writing a blank
  `entityType` or `entityId`, or no audit row at all.
- **Bulk operations collapse to one ID.** `deriveEntityId` returns the first
  ID it finds by walking the object; a bulk-create endpoint that returns an
  array of created records would only be recorded once and against
  whichever ID the recursive walk happens to reach first.
