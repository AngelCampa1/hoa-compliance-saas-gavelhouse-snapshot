import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { PUBLIC_WEB_URL } from "@boardstack/shared";
import { createDb } from "../db/client.js";
import { leads } from "../db/schema/index.js";
import { captureEvent } from "../lib/observability.js";
import type { Env } from "../types/env.js";
import { unsubscribeSequencerContact } from "../lib/sequencer.js";

const TokenSchema = z.string().uuid();

const unsubscribeApp = new Hono<{ Bindings: Env }>();

unsubscribeApp.get("/signup", async (c) => {
  const publicWebUrl = c.env.PUBLIC_WEB_URL ?? PUBLIC_WEB_URL;
  const invalidUrl = `${publicWebUrl}/unsubscribed?error=invalid`;
  return c.redirect(invalidUrl, 302);
});

unsubscribeApp.get("/", async (c) => {
  const publicWebUrl = c.env.PUBLIC_WEB_URL ?? PUBLIC_WEB_URL;
  const invalidUrl = `${publicWebUrl}/unsubscribed?error=invalid`;
  const successUrl = `${publicWebUrl}/unsubscribed`;

  const token = c.req.query("token");
  const parsed = TokenSchema.safeParse(token);
  if (!parsed.success) {
    return c.redirect(invalidUrl, 302);
  }

  const db = createDb(c.env);

  const found = await db
    .select()
    .from(leads)
    .where(eq(leads.unsubscribeToken, parsed.data))
    .limit(1);

  if (found.length === 0) {
    return c.redirect(invalidUrl, 302);
  }

  const lead = found[0];

  // Idempotency: if the lead already unsubscribed, do not overwrite the
  // original unsubscribedAt timestamp — that is the record-of-request for
  // CAN-SPAM audit purposes. Enrollment fan-out is also skipped since the
  // prior unsubscribe already flipped any active enrollments.
  if (lead.unsubscribedAt === null) {
    await db
      .update(leads)
      .set({ unsubscribedAt: new Date() })
      .where(eq(leads.id, lead.id));

    await unsubscribeSequencerContact(c.env, lead.email, { leadId: lead.id });
  }

  try {
    await captureEvent(
      "lead_unsubscribed",
      { lead_id: lead.id },
      `lead:${lead.id}`,
      c.env,
    );
  } catch {
    // Analytics must never crash the request — swallow and continue.
  }

  return c.redirect(successUrl, 302);
});

export default unsubscribeApp;
