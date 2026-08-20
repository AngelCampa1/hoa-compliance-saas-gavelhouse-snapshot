import { Hono } from "hono";
import type { Env } from "../types/env.js";
import {
  getLeadMagnetObjectKey,
  parseLeadMagnetPdfFilename,
  verifyLeadMagnetDownloadSignature,
} from "../lib/leadMagnetDownloads.js";
import { captureEvent } from "../lib/observability.js";

const downloadsRouter = new Hono<{ Bindings: Env }>();

async function captureDownloadEvent(
  c: { env: Env },
  name: "lead_magnet_downloaded" | "lead_magnet_download_failed",
  properties: Record<string, unknown>,
): Promise<void> {
  try {
    await captureEvent(name, properties, undefined, c.env);
  } catch {
    // Analytics is best-effort and must not affect downloads.
  }
}

downloadsRouter.get("/downloads/:filename", async (c) => {
  const filename = c.req.param("filename");
  const slug = parseLeadMagnetPdfFilename(filename);
  if (!slug) {
    await captureDownloadEvent(c, "lead_magnet_download_failed", {
      failure_type: "invalid_filename",
    });
    return c.json({ error: "not_found" }, 404);
  }

  const valid = await verifyLeadMagnetDownloadSignature({
    slug,
    expires: c.req.query("expires") ?? null,
    signature: c.req.query("signature") ?? null,
    env: c.env,
  });
  if (!valid) {
    await captureDownloadEvent(c, "lead_magnet_download_failed", {
      content_slug: slug,
      failure_type: "invalid_signature",
    });
    return c.json({ error: "forbidden" }, 403);
  }

  const bucket = c.env.LEAD_MAGNETS_BUCKET;
  if (!bucket) {
    await captureDownloadEvent(c, "lead_magnet_download_failed", {
      content_slug: slug,
      failure_type: "bucket_not_configured",
    });
    return c.json({ error: "lead_magnets_bucket_not_configured" }, 503);
  }

  const object = await bucket.get(getLeadMagnetObjectKey(slug));
  if (!object) {
    await captureDownloadEvent(c, "lead_magnet_download_failed", {
      content_slug: slug,
      failure_type: "missing_object",
    });
    return c.json({ error: "not_found" }, 404);
  }

  await captureDownloadEvent(c, "lead_magnet_downloaded", {
    content_slug: slug,
  });

  return new Response(object.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${slug}.pdf"`,
      "Cache-Control": "private, max-age=300",
      ...(object.httpEtag ? { ETag: object.httpEtag } : {}),
    },
  });
});

export default downloadsRouter;
