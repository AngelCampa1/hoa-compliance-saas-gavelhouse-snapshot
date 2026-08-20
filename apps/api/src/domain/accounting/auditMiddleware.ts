import type { MiddlewareHandler } from "hono";
import type { Env } from "../../types/env.js";
import type { Db } from "../../db/client.js";
import { auditEvents } from "../../db/schema/audit.js";
import { getAuth } from "../../lib/auth.js";
import { nanoid } from "../../lib/nanoid.js";
import { captureException } from "../../lib/observability.js";

type AuditAction = "create" | "update" | "delete" | "post" | "reverse";

function deriveEntityType(pathname: string): string {
  const segments = pathname.split("/");
  const area = segments[1];
  const resource = segments[2];
  const nestedResource = segments[4] ?? segments[3];
  if (area === "finance") {
    if (resource === "accounts") return "account";
    if (resource === "journal") return "journalEntry";
    if (resource === "units") return "unit";
    if (resource === "homeowners") return "homeowner";
    if (resource === "assessments") return "assessment";
    if (resource === "dues")
      return nestedResource === "pay" ? "payment" : "assessment";
    if (resource === "reserves" || resource === "reserve-study")
      return "reserveStudy";
  }
  if (area === "governance") {
    if (resource === "homeowners") return "homeowner";
    if (resource === "violations") return "violation";
    if (resource === "arch-requests") return "archRequest";
    if (resource === "transitions") return "boardTransition";
    if (resource === "meetings") {
      if (nestedResource === "motions") return "motion";
      return "meeting";
    }
    if (resource === "motions") return "motion";
  }
  if (area === "owner") {
    if (resource === "sessions") return "ownerPortalSession";
    if (resource === "dues") return "payment";
    if (resource === "arch-requests") return "archRequest";
  }
  if (area === "bank") {
    if (resource === "statements") return "bankStatement";
    if (resource === "reconciliations") return "reconciliation";
  }
  if (area === "close") return "monthEndClose";
  if (area === "portfolio") return "portfolio";
  return "";
}

function deriveAction(method: string): AuditAction | null {
  if (method === "POST") return "create";
  if (method === "PATCH" || method === "PUT") return "update";
  if (method === "DELETE") return "delete";
  return null;
}

function deriveEntityId(body: unknown): string {
  if (body !== null && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    if (typeof obj["id"] === "string") return obj["id"];
    if (typeof obj["entryId"] === "string") return obj["entryId"];
    if (typeof obj["reconciliationId"] === "string")
      return obj["reconciliationId"];
    for (const value of Object.values(obj)) {
      const nestedId = deriveEntityId(value);
      if (nestedId) return nestedId;
    }
  }
  return "";
}

function deriveCommunityId(body: unknown): string {
  if (body !== null && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    if (typeof obj["communityId"] === "string") return obj["communityId"];
    for (const value of Object.values(obj)) {
      const nestedCommunityId = deriveCommunityId(value);
      if (nestedCommunityId) return nestedCommunityId;
    }
  }
  return "";
}

export async function insertAuditEvent(
  db: Db,
  event: {
    communityId: string;
    actorUserId: string | null;
    action: AuditAction;
    entityType: string;
    entityId: string;
    diffJson?: unknown;
  },
): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      id: nanoid(),
      communityId: event.communityId,
      actorUserId: event.actorUserId,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      diffJson: event.diffJson ?? null,
    });
  } catch (err) {
    captureException(err, {
      tags: { source: "audit-event-insert" },
      extra: { action: event.action, entityType: event.entityType },
    });
  }
}

export function createAuditMiddleware(
  getDb: (env: Env) => Db,
): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const method = c.req.method;
    const action = deriveAction(method);
    if (action === null) {
      await next();
      return;
    }

    const url = new URL(c.req.url);

    // Parse the request body BEFORE calling next() so the body stream is still
    // available. The downstream handler (wrapped by zValidator) has already
    // cached the parsed body, but the raw stream may not be replayable after
    // next() returns. Store what we need now.
    let communityId = "";

    // For mutating requests try to extract communityId from the body first.
    // We clone the raw request so we don't consume the stream that the handler needs.
    try {
      const clonedReq = c.req.raw.clone();
      const reqBody = (await clonedReq.json()) as unknown;
      communityId = deriveCommunityId(reqBody);
    } catch {
      // body may not be JSON — fall through to query param
    }

    if (!communityId) {
      communityId = url.searchParams.get("communityId") ?? "";
    }

    await next();

    if (c.res.status < 200 || c.res.status >= 300) return;

    const entityType = deriveEntityType(url.pathname);
    if (!entityType) return;

    let responseBody: unknown = null;
    try {
      const cloned = c.res.clone();
      responseBody = await cloned.json();
    } catch {
      // response may not be JSON
    }

    if (!communityId) {
      communityId = deriveCommunityId(responseBody);
    }
    if (!communityId) return;

    let actorUserId: string | null = null;
    try {
      const auth = getAuth(c.env);
      const session = await auth.api.getSession({
        headers: c.req.raw.headers,
      });
      actorUserId = session?.user?.id ?? null;
    } catch {
      // actorUserId remains null — auth failure should not block the response
    }

    const entityId = deriveEntityId(responseBody);
    const db = getDb(c.env);

    void insertAuditEvent(db, {
      communityId,
      actorUserId,
      action,
      entityType,
      entityId,
    });
  };
}
