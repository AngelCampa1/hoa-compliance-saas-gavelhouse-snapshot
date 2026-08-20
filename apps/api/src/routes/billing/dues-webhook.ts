import { Hono } from "hono";
import type Stripe from "stripe";
import { eq, and, inArray, sql } from "drizzle-orm";
import { createDb } from "../../db/client.js";
import { assessments, payments } from "../../db/schema/dues.js";
import { accounts } from "../../db/schema/accounts.js";
import { journalEntries, journalLines } from "../../db/schema/journal.js";
import { processedStripeEvents } from "../../db/schema/billing.js";
import type { Env } from "../../types/env.js";
import { nanoid } from "../../lib/nanoid.js";
import { postEntry } from "../../domain/accounting/postEntry.js";
import { createStripe } from "../../lib/stripe-client.js";
import { captureEvent } from "../../lib/observability.js";
import {
  acquireXactLock,
  assessmentLockKey,
} from "../../domain/policy/locks.js";

const duesWebhookRouter = new Hono<{ Bindings: Env }>();
type PgError = Error & { code?: string };

duesWebhookRouter.post("/billing/dues-webhook", async (c) => {
  const stripe = createStripe(c.env);
  const sig = c.req.header("stripe-signature");
  if (!sig) return c.json({ error: "Missing signature" }, 400);

  const body = await c.req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig,
      c.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return c.json({ error: "Invalid signature" }, 400);
  }

  const db = createDb(c.env);

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const assessmentId = pi.metadata?.["assessmentId"];
    const communityId = pi.metadata?.["communityId"];
    const homeownerId = pi.metadata?.["homeownerId"] ?? null;
    const method = pi.metadata?.["method"];

    if (!assessmentId || !communityId) {
      return c.json({ received: true });
    }

    try {
      await db.transaction(async (tx) => {
        // Serialize against the dues/pay reservation tx on the SAME assessment.
        // MUST be the first statement in the tx (helper contract): an xact
        // advisory lock taken first guarantees this handler and the pay-path
        // reservation cannot interleave their count-then-write on this ledger,
        // closing the over-collection race end-to-end. Released on commit/rollback.
        await acquireXactLock(tx, assessmentLockKey(assessmentId));

        // Idempotency guard — same pattern as payment_failed / charge.refunded /
        // payment_intent.canceled below. The earlier `existingPayment.journalEntryId`
        // check alone could not stop a CONCURRENT redelivery: under READ COMMITTED
        // two in-flight deliveries both read journalEntryId === null and both post
        // a journal entry, double-counting the payment. The processed-events PK
        // insert serializes them — the second delivery blocks on the first's
        // uncommitted row, then sees the conflict and short-circuits.
        const inserted = await tx
          .insert(processedStripeEvents)
          .values({ eventId: event.id })
          .onConflictDoNothing()
          .returning({ eventId: processedStripeEvents.eventId });

        if (inserted.length === 0) {
          return;
        }

        const [assessment] = await tx
          .select()
          .from(assessments)
          .where(
            and(
              eq(assessments.id, assessmentId),
              eq(assessments.communityId, communityId),
            ),
          )
          .limit(1);

        if (!assessment) return;

        // Defence-in-depth: also skip if a journal entry is already linked to
        // this PI (e.g. a legacy row from before the processed-events guard).
        const [existingPayment] = await tx
          .select()
          .from(payments)
          .where(eq(payments.stripePaymentIntentId, pi.id))
          .limit(1);

        if (existingPayment?.journalEntryId) {
          return;
        }

        const accountCode =
          assessment.fundType === "operating" ? "4000" : "4100";
        const cashCode = assessment.fundType === "operating" ? "1000" : "1500";

        const [revenueAccount] = await tx
          .select()
          .from(accounts)
          .where(
            and(
              eq(accounts.communityId, communityId),
              eq(accounts.code, accountCode),
            ),
          )
          .limit(1);

        const [cashAccount] = await tx
          .select()
          .from(accounts)
          .where(
            and(
              eq(accounts.communityId, communityId),
              eq(accounts.code, cashCode),
            ),
          )
          .limit(1);

        if (!revenueAccount || !cashAccount) {
          return;
        }

        const today = new Date().toISOString().slice(0, 10);

        const postPaymentEntry = () =>
          postEntry(tx, {
            communityId,
            createdByUserId: null,
            entryDate: today,
            memo: `Dues payment via Stripe - PI ${pi.id}`,
            lines: [
              {
                accountId: cashAccount.id,
                debitCents: pi.amount,
                creditCents: 0,
              },
              {
                accountId: revenueAccount.id,
                debitCents: 0,
                creditCents: pi.amount,
              },
            ],
          });

        // Determine the payment row to post against. A pending row created by
        // the dues/pay reservation tx was already validated under THIS same
        // advisory lock at PI-creation time, so it is safe to link+post without
        // re-checking. A missing pending row means a legacy/externally-created
        // PI we never reserved — there we MUST re-derive the under-lock
        // outstanding balance before posting so we never push the ledger above
        // assessment.amountCents.
        const [pendingRow] = await tx
          .select()
          .from(payments)
          .where(eq(payments.stripePaymentIntentId, pi.id))
          .limit(1);

        if (pendingRow) {
          const entryResult = await postPaymentEntry();
          await tx
            .update(payments)
            .set({ journalEntryId: entryResult.entryId })
            .where(eq(payments.id, pendingRow.id));
        } else {
          const [paidRow] = await tx
            .select({
              paidCents:
                sql<number>`coalesce(sum(${payments.amountCents}), 0)`.mapWith(
                  Number,
                ),
            })
            .from(payments)
            .where(eq(payments.assessmentId, assessmentId));
          const alreadyPaidCents = paidRow?.paidCents ?? 0;
          const outstandingCents = assessment.amountCents - alreadyPaidCents;

          if (pi.amount > outstandingCents) {
            // Posting this PI would over-collect. Skip the insert+post and leave
            // the assessment status unchanged; emit a reconciliation signal so a
            // human can resolve the orphaned capture. Still ack the webhook.
            try {
              await captureEvent(
                "dues_webhook_overcollection_skipped",
                {
                  community_id: communityId,
                  assessment_id: assessmentId,
                  pi_id: pi.id,
                  pi_amount_cents: pi.amount,
                  outstanding_cents: outstandingCents,
                },
                undefined,
                c.env,
              );
            } catch {
              // Analytics is best-effort and must not break the webhook.
            }
            return;
          }

          const entryResult = await postPaymentEntry();
          await tx.insert(payments).values({
            id: nanoid(),
            assessmentId,
            homeownerId,
            amountCents: pi.amount,
            method: method === "ach" ? "ach" : "card",
            stripePaymentIntentId: pi.id,
            journalEntryId: entryResult.entryId,
          });
        }

        await tx
          .update(assessments)
          .set({ status: "paid", updatedAt: new Date() })
          .where(
            and(
              eq(assessments.id, assessmentId),
              eq(assessments.communityId, communityId),
            ),
          );
      });
    } catch (error) {
      if ((error as PgError).code === "23505") {
        return c.json({ received: true });
      }
      throw error;
    }
  } else if (event.type === "payment_intent.payment_failed") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const assessmentId = pi.metadata?.["assessmentId"];
    const communityId = pi.metadata?.["communityId"];

    if (!assessmentId || !communityId) {
      return c.json({ received: true });
    }

    // Idempotency insert + assessment update run in one transaction so a
    // Stripe redelivery cannot re-run the past_due transition. Short-circuits
    // inside the callback when the event was already processed.
    await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(processedStripeEvents)
        .values({ eventId: event.id })
        .onConflictDoNothing()
        .returning({ eventId: processedStripeEvents.eventId });

      if (inserted.length === 0) {
        return;
      }

      // Why: only transition open assessments (pending/past_due) to past_due.
      // A stale payment_failed redelivered after the homeowner retried and paid
      // (new PI succeeded) must NEVER flip a "paid" row back to past_due, and a
      // board-decided "waived" row is terminal too. Scoping the update to the
      // open source states is safer than a single ne(status, "paid") guard.
      await tx
        .update(assessments)
        .set({ status: "past_due", updatedAt: new Date() })
        .where(
          and(
            eq(assessments.id, assessmentId),
            eq(assessments.communityId, communityId),
            inArray(assessments.status, ["pending", "past_due"]),
          ),
        );
    });
  } else if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const paymentIntentId =
      typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : charge.payment_intent?.id;

    if (!paymentIntentId) {
      return c.json({ received: true });
    }

    // Why: partial refunds (amount_refunded < amount) must post a proportional
    // reversal rather than a full one, and must not flip the assessment to
    // pending — the original charge is still partially valid.
    const amountRefunded = charge.amount_refunded;
    const totalAmount = charge.amount;
    const isPartialRefund =
      typeof amountRefunded === "number" &&
      typeof totalAmount === "number" &&
      totalAmount > 0 &&
      amountRefunded < totalAmount;

    // Idempotency insert + all side effects run in one transaction so a
    // mid-handler failure followed by a Stripe retry cannot skip work or
    // double-post. If the idempotency row already exists the txn commits
    // with no work done (short-circuit inside the callback).
    await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(processedStripeEvents)
        .values({ eventId: event.id })
        .onConflictDoNothing()
        .returning({ eventId: processedStripeEvents.eventId });

      if (inserted.length === 0) {
        return;
      }

      const [payment] = await tx
        .select()
        .from(payments)
        .where(eq(payments.stripePaymentIntentId, paymentIntentId))
        .limit(1);

      if (!payment || !payment.journalEntryId) {
        return;
      }

      const [assessment] = await tx
        .select()
        .from(assessments)
        .where(eq(assessments.id, payment.assessmentId))
        .limit(1);

      if (!assessment) {
        return;
      }

      // Read the original journal lines to build the reversal.
      const originalLines = await tx
        .select()
        .from(journalLines)
        .where(eq(journalLines.entryId, payment.journalEntryId));

      if (originalLines.length === 0) {
        return;
      }

      const today = new Date().toISOString().slice(0, 10);

      // Scale reversal lines. For a full refund the ratio is 1 and all amounts
      // are identical to the originals (swapped). For a partial refund each
      // line is scaled by amountRefunded/totalAmount using integer cents math
      // to avoid float precision errors. Any 1-cent rounding remainder is
      // added to the largest line.
      const buildReversalLines = () => {
        if (!isPartialRefund) {
          return originalLines.map((line) => ({
            accountId: line.accountId,
            debitCents: line.creditCents,
            creditCents: line.debitCents,
          }));
        }

        // Integer scaling: floor each value, then correct rounding on largest.
        const scaled = originalLines.map((line) => ({
          accountId: line.accountId,
          rawDebit: line.creditCents,
          rawCredit: line.debitCents,
          debitCents: Math.floor(
            (line.creditCents * (amountRefunded as number)) /
              (totalAmount as number),
          ),
          creditCents: Math.floor(
            (line.debitCents * (amountRefunded as number)) /
              (totalAmount as number),
          ),
        }));

        // Find the expected total debit after scaling and correct the remainder
        // on the line with the largest raw debit so debits === credits.
        const totalScaledDebit = scaled.reduce((s, l) => s + l.debitCents, 0);
        const totalScaledCredit = scaled.reduce((s, l) => s + l.creditCents, 0);
        const debitRemainder = (amountRefunded as number) - totalScaledDebit;
        const creditRemainder = (amountRefunded as number) - totalScaledCredit;

        if (debitRemainder !== 0) {
          const idx = scaled.reduce(
            (maxIdx, l, i) =>
              l.rawDebit > scaled[maxIdx]!.rawDebit ? i : maxIdx,
            0,
          );
          scaled[idx]!.debitCents += debitRemainder;
        }
        if (creditRemainder !== 0) {
          const idx = scaled.reduce(
            (maxIdx, l, i) =>
              l.rawCredit > scaled[maxIdx]!.rawCredit ? i : maxIdx,
            0,
          );
          scaled[idx]!.creditCents += creditRemainder;
        }

        return scaled.map((l) => ({
          accountId: l.accountId,
          debitCents: l.debitCents,
          creditCents: l.creditCents,
        }));
      };

      // Post reversal entry with debits and credits swapped (and optionally scaled).
      const reversalResult = await postEntry(tx, {
        communityId: assessment.communityId,
        createdByUserId: null,
        entryDate: today,
        memo: `Dues refund reversal — Stripe charge ${charge.id}`,
        lines: buildReversalLines(),
      });

      // Link the original entry to its reversal for audit trail.
      await tx
        .update(journalEntries)
        .set({ reversedByEntryId: reversalResult.entryId })
        .where(eq(journalEntries.id, payment.journalEntryId));

      // Flip assessment back to pending only for a full refund.
      // A partial refund leaves the assessment as paid since the charge
      // is still partially valid.
      if (!isPartialRefund) {
        await tx
          .update(assessments)
          .set({ status: "pending", updatedAt: new Date() })
          .where(eq(assessments.id, assessment.id));
      }
    });

    // After the transaction, re-check if we short-circuited for idempotency
    // and return the standard acknowledgement either way.
  } else if (event.type === "payment_intent.canceled") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const assessmentId = pi.metadata?.["assessmentId"];
    const communityId = pi.metadata?.["communityId"];

    if (!assessmentId || !communityId) {
      return c.json({ received: true });
    }

    // Idempotency insert + assessment update run in one transaction so a
    // mid-handler failure followed by a Stripe retry cannot leave books
    // inconsistent. Short-circuits inside the callback when already processed.
    await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(processedStripeEvents)
        .values({ eventId: event.id })
        .onConflictDoNothing()
        .returning({ eventId: processedStripeEvents.eventId });

      if (inserted.length === 0) {
        return;
      }

      const [assessment] = await tx
        .select()
        .from(assessments)
        .where(
          and(
            eq(assessments.id, assessmentId),
            eq(assessments.communityId, communityId),
          ),
        )
        .limit(1);

      if (!assessment) {
        return;
      }

      // Reset assessment to pending — the PI was canceled before payment captured.
      // Only update if not already in a terminal state (paid, waived).
      if (assessment.status !== "paid" && assessment.status !== "waived") {
        await tx
          .update(assessments)
          .set({ status: "pending", updatedAt: new Date() })
          .where(eq(assessments.id, assessment.id));
      }
    });
  }

  return c.json({ received: true });
});

export default duesWebhookRouter;
