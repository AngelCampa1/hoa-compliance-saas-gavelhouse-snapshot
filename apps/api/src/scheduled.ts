import type { Env } from "./types/env.js";
import { createDb } from "./db/client.js";
import { assessments, homeowners, unitOwnerships } from "./db/schema/dues.js";
import { communities } from "./db/schema/tenancy.js";
import { ownerPortalSessions } from "./db/schema/governance.js";
import { eq, and, inArray, isNull, lte, or, gte } from "drizzle-orm";
import {
  buildReminderEmail,
  sendReminderEmail,
} from "./domain/governance/duesReminder.js";
import { captureException } from "./lib/observability.js";
import { nanoid } from "./lib/nanoid.js";
import {
  expireTrialsWithoutBillingSweep,
  sendTrialEndingReminderSweep,
  sendTrialStartedEmailSweep,
} from "./domain/billing/trialLifecycle.js";
import {
  DUES_REMINDER_OVERDUE_INTERVAL_DAYS,
  OWNER_PORTAL_LINK_EXPIRY_DAYS,
  PUBLIC_APP_URL,
} from "@boardstack/shared";
import { isGavelhouseShutdown } from "./lib/shutdown.js";

export async function scheduledHandler(
  event: ScheduledEvent,
  env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  if (isGavelhouseShutdown(env)) return;

  try {
    await runScheduledTasks(event, env);
  } catch (err) {
    captureException(err, {
      tags: { source: "scheduled", job: "unhandled-scheduled-task" },
      extra: { cron: event.cron },
    });
  }
}

async function runScheduledTasks(
  event: ScheduledEvent,
  env: Env,
): Promise<void> {
  const db = createDb(env);

  try {
    await expireTrialsWithoutBillingSweep(env);
    await sendTrialStartedEmailSweep(env);
    await sendTrialEndingReminderSweep(env);
  } catch (err) {
    captureException(err, {
      tags: { source: "scheduled", job: "trial-lifecycle-emails" },
      extra: { cron: event.cron },
    });
  }

  // Only send reminders on specific overdue intervals.
  // This prevents blasting every pending assessment on every daily run.
  const overdueDates = DUES_REMINDER_OVERDUE_INTERVAL_DAYS.map((daysAgo) =>
    new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10),
  );

  const overdueAssessments = await db
    .select({
      assessmentId: assessments.id,
      amountCents: assessments.amountCents,
      dueDate: assessments.dueDate,
      communityId: assessments.communityId,
      unitId: assessments.unitId,
    })
    .from(assessments)
    .where(
      and(
        eq(assessments.status, "pending"),
        inArray(assessments.dueDate, overdueDates),
      ),
    );

  if (overdueAssessments.length === 0) return;

  const communityIds = [
    ...new Set(overdueAssessments.map((a) => a.communityId)),
  ];
  const communityRows = await db
    .select()
    .from(communities)
    .where(inArray(communities.id, communityIds));
  const communityMap = new Map(communityRows.map((c) => [c.id, c.name]));

  for (const assessment of overdueAssessments) {
    const communityName =
      communityMap.get(assessment.communityId) ?? "Your HOA";

    // Find homeowners who own the specific unit on this assessment.
    // If assessment has no unitId it is community-wide; send to all active homeowners.
    let targetHomeowners: (typeof homeowners.$inferSelect)[];

    if (assessment.unitId) {
      const reminderDate = new Date().toISOString().slice(0, 10);
      const ownershipRows = await db
        .select({ homeownerId: unitOwnerships.homeownerId })
        .from(unitOwnerships)
        .where(
          and(
            eq(unitOwnerships.unitId, assessment.unitId),
            lte(unitOwnerships.startDate, reminderDate),
            or(
              isNull(unitOwnerships.endDate),
              gte(unitOwnerships.endDate, reminderDate),
            ),
          ),
        );

      const ownerIds = ownershipRows.map((r) => r.homeownerId);

      if (ownerIds.length === 0) {
        targetHomeowners = [];
      } else {
        targetHomeowners = await db
          .select()
          .from(homeowners)
          .where(
            and(inArray(homeowners.id, ownerIds), eq(homeowners.active, true)),
          );
      }
    } else {
      targetHomeowners = await db
        .select()
        .from(homeowners)
        .where(
          and(
            eq(homeowners.communityId, assessment.communityId),
            eq(homeowners.active, true),
          ),
        );
    }

    for (const homeowner of targetHomeowners) {
      try {
        const token = nanoid(48);
        const expiresAt = new Date(
          Date.now() + OWNER_PORTAL_LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
        );
        if ("insert" in db && typeof db.insert === "function") {
          await db.insert(ownerPortalSessions).values({
            id: nanoid(),
            homeownerId: homeowner.id,
            communityId: assessment.communityId,
            token,
            expiresAt,
          });
        }
        const portalBaseUrl = (env.APP_URL || PUBLIC_APP_URL).replace(
          /\/+$/,
          "",
        );
        const portalUrl = `${portalBaseUrl}/portal?token=${encodeURIComponent(token)}`;
        const email = await buildReminderEmail(
          {
            firstName: homeowner.firstName,
            email: homeowner.email,
            amountCents: assessment.amountCents,
            dueDate: assessment.dueDate,
            communityName,
            portalUrl,
          },
          env,
        );
        await sendReminderEmail(email, env.RESEND_API_KEY);
      } catch (err) {
        captureException(err, {
          tags: { source: "scheduled", job: "dues-reminder-email" },
          extra: {
            assessmentId: assessment.assessmentId,
            communityId: assessment.communityId,
            dueDate: assessment.dueDate,
          },
        });
      }
    }
  }
}
