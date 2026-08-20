import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getAuth } from "../lib/auth.js";
import { createDb } from "../db/client.js";
import { feedbackSubmissions } from "../db/schema/index.js";
import { captureEvent } from "../lib/observability.js";
import type { Env } from "../types/env.js";

const FeedbackSubmitSchema = z.object({
  category: z.enum(["bug", "idea", "other"]),
  /** Free-form feedback text. Trimmed, 1–2 000 chars. */
  message: z.string().trim().min(1).max(2000),
  /** Full URL of the page the user submitted from. */
  pageUrl: z.string().url().max(2048),
});

type Variables = { userId: string };

const feedbackRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

function analyticsPagePath(pageUrl: string): string {
  const parsed = new URL(pageUrl);
  return parsed.pathname;
}

function isAllowedPageUrl(pageUrl: string, env: Env): boolean {
  if (!env.APP_URL) return false;
  return new URL(pageUrl).origin === new URL(env.APP_URL).origin;
}

// Require an active session — feedback is only accepted from authenticated users.
feedbackRouter.use("/api/feedback", async (c, next) => {
  const auth = getAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
});

feedbackRouter.post(
  "/api/feedback",
  zValidator("json", FeedbackSubmitSchema),
  async (c) => {
    const userId = c.get("userId");
    const { category, message, pageUrl } = c.req.valid("json");
    if (!isAllowedPageUrl(pageUrl, c.env)) {
      return c.json({ error: "pageUrl origin is not allowed" }, 400);
    }

    const db = createDb(c.env);
    await db
      .insert(feedbackSubmissions)
      .values({ userId, category, message, pageUrl });

    // Fire-and-await PostHog analytics — swallowed so it never fails the request.
    try {
      await captureEvent(
        "feedback_submitted",
        { category, page_path: analyticsPagePath(pageUrl) },
        userId,
        c.env,
      );
    } catch {
      // Analytics must never crash the request.
    }

    return c.json({ ok: true });
  },
);

export default feedbackRouter;
