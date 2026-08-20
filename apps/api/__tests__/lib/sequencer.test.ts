import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../src/types/env.js";
import {
  enrollSequencerSequence,
  unsubscribeSequencerContact,
  upsertSequencerContact,
} from "../../src/lib/sequencer.js";

const env = {
  SEQUENCER_BASE_URL: "https://sequencer.ventoralabs.com/",
  SEQUENCER_CF_ACCESS_CLIENT_ID: "client-id",
  SEQUENCER_CF_ACCESS_CLIENT_SECRET: "client-secret",
} as Env;

describe("sequencer client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    );
  });

  it("skips calls when Sequencer credentials are not configured", async () => {
    const result = await upsertSequencerContact({} as Env, {
      email: "board@example.com",
    });

    expect(result).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("skips enrollment calls when Sequencer credentials are not configured", async () => {
    const result = await enrollSequencerSequence({} as Env, {
      email: "board@example.com",
      sequenceSlug: "boardstack-nurture-value-1",
      externalId: "lead-1:reserve-fund-calculator",
    });

    expect(result).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("upserts contacts with Cloudflare Access headers", async () => {
    await upsertSequencerContact(env, {
      email: "board@example.com",
      firstName: "Angel",
      metadata: { leadId: "lead-1" },
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://sequencer.ventoralabs.com/api/v1/contacts",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "CF-Access-Client-Id": "client-id",
          "CF-Access-Client-Secret": "client-secret",
        }),
        body: JSON.stringify({
          product: "boardstack",
          email: "board@example.com",
          first_name: "Angel",
          properties: { leadId: "lead-1" },
        }),
      }),
    );
  });

  it("upserts then enrolls a sequence", async () => {
    await enrollSequencerSequence(env, {
      email: "board@example.com",
      sequenceSlug: "boardstack-nurture-value-1",
      externalId: "lead-1:reserve-fund-calculator",
      metadata: { leadId: "lead-1", magnetSlug: "reserve-fund-calculator" },
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    const secondCall = vi.mocked(fetch).mock.calls[1];
    expect(secondCall[0]).toBe(
      "https://sequencer.ventoralabs.com/api/v1/enrollments",
    );
    expect(JSON.parse(String(secondCall[1]?.body))).toEqual({
      product: "boardstack",
      email: "board@example.com",
      sequence_slug: "boardstack-nurture-value-1",
      source: "boardstack-api",
      properties: {
        leadId: "lead-1",
        magnetSlug: "reserve-fund-calculator",
        externalId: "lead-1:reserve-fund-calculator",
        external_id: "lead-1:reserve-fund-calculator",
      },
    });
  });

  it("forwards unsubscribe requests", async () => {
    await unsubscribeSequencerContact(env, "board@example.com", {
      leadId: "lead-1",
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://sequencer.ventoralabs.com/api/v1/unsubscribe",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          product: "boardstack",
          email: "board@example.com",
          scope: "product",
          reason: "Gavelhouse lead unsubscribe",
        }),
      }),
    );
  });

  it("forwards custom unsubscribe reasons when provided", async () => {
    await unsubscribeSequencerContact(env, "board@example.com", {
      reason: "Manual suppression request",
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://sequencer.ventoralabs.com/api/v1/unsubscribe",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          product: "boardstack",
          email: "board@example.com",
          scope: "product",
          reason: "Manual suppression request",
        }),
      }),
    );
  });

  it("throws when Sequencer rejects a request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad", { status: 502 })),
    );

    await expect(
      upsertSequencerContact(env, { email: "board@example.com" }),
    ).rejects.toThrow("Sequencer request failed: 502");
  });

  it("throws with a status-only message when the error body cannot be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        text: vi.fn(async () => {
          throw new Error("stream failed");
        }),
      })),
    );

    await expect(
      unsubscribeSequencerContact(env, "board@example.com"),
    ).rejects.toThrow("Sequencer request failed: 503 Service Unavailable");
  });
});
