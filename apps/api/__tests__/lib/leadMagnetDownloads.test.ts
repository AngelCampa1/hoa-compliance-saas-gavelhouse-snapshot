import { describe, expect, it } from "vitest";
import {
  buildSignedLeadMagnetDownloadUrl,
  parseLeadMagnetPdfFilename,
  verifyLeadMagnetDownloadSignature,
} from "../../src/lib/leadMagnetDownloads.js";

const env = {
  PUBLIC_API_URL: "https://api.gavelhouse.app",
  LEAD_MAGNET_DOWNLOAD_SECRET: "test-download-secret",
};

describe("leadMagnetDownloads", () => {
  it("builds and verifies a signed URL", async () => {
    const url = await buildSignedLeadMagnetDownloadUrl({
      slug: "reserve-fund-calculator",
      env,
      now: new Date("2026-05-01T00:00:00.000Z"),
    });
    const parsed = new URL(url);

    await expect(
      verifyLeadMagnetDownloadSignature({
        slug: "reserve-fund-calculator",
        expires: parsed.searchParams.get("expires"),
        signature: parsed.searchParams.get("signature"),
        env,
        now: new Date("2026-05-02T00:00:00.000Z"),
      }),
    ).resolves.toBe(true);
  });

  it("throws when signing without a configured secret", async () => {
    await expect(
      buildSignedLeadMagnetDownloadUrl({
        slug: "reserve-fund-calculator",
        env: { PUBLIC_API_URL: "https://api.gavelhouse.app" },
      }),
    ).rejects.toThrow(/LEAD_MAGNET_DOWNLOAD_SECRET/);
  });

  it("defaults to the production API origin when PUBLIC_API_URL is unset", async () => {
    const url = await buildSignedLeadMagnetDownloadUrl({
      slug: "reserve-fund-calculator",
      env: {
        LEAD_MAGNET_DOWNLOAD_SECRET: "test-download-secret",
      },
    });

    expect(new URL(url).origin).toBe("https://api.gavelhouse.app");
  });

  it("throws when building a URL for an unknown slug", async () => {
    await expect(
      buildSignedLeadMagnetDownloadUrl({
        slug: "unknown-slug",
        env,
      }),
    ).rejects.toThrow(/Unknown lead magnet slug/);
  });

  it("rejects malformed verification inputs", async () => {
    await expect(
      verifyLeadMagnetDownloadSignature({
        slug: "unknown-slug",
        expires: "1770000000",
        signature: "0".repeat(64),
        env,
      }),
    ).resolves.toBe(false);
    await expect(
      verifyLeadMagnetDownloadSignature({
        slug: "reserve-fund-calculator",
        expires: null,
        signature: "0".repeat(64),
        env,
      }),
    ).resolves.toBe(false);
    await expect(
      verifyLeadMagnetDownloadSignature({
        slug: "reserve-fund-calculator",
        expires: "not-a-number",
        signature: "0".repeat(64),
        env,
      }),
    ).resolves.toBe(false);
    await expect(
      verifyLeadMagnetDownloadSignature({
        slug: "reserve-fund-calculator",
        expires: "999999999999999999999999",
        signature: "0".repeat(64),
        env,
      }),
    ).resolves.toBe(false);
    await expect(
      verifyLeadMagnetDownloadSignature({
        slug: "reserve-fund-calculator",
        expires: "1770000000",
        signature: null,
        env,
      }),
    ).resolves.toBe(false);
    await expect(
      verifyLeadMagnetDownloadSignature({
        slug: "reserve-fund-calculator",
        expires: "1770000000",
        signature: "not-hex",
        env,
      }),
    ).resolves.toBe(false);
  });

  it("rejects a tampered signature (constant-time compare — valid sig modified by one char)", async () => {
    const url = await buildSignedLeadMagnetDownloadUrl({
      slug: "reserve-fund-calculator",
      env,
      now: new Date("2026-05-01T00:00:00.000Z"),
    });
    const parsed = new URL(url);
    const validSig = parsed.searchParams.get("signature") ?? "";
    // Flip the last hex character to produce a tampered signature of the same length
    const lastChar = validSig[validSig.length - 1];
    const tamperedChar = lastChar === "a" ? "b" : "a";
    const tamperedSig = validSig.slice(0, -1) + tamperedChar;

    await expect(
      verifyLeadMagnetDownloadSignature({
        slug: "reserve-fund-calculator",
        expires: parsed.searchParams.get("expires"),
        signature: tamperedSig,
        env,
        now: new Date("2026-05-02T00:00:00.000Z"),
      }),
    ).resolves.toBe(false);
  });

  it("parses only known .pdf lead magnet filenames", () => {
    expect(parseLeadMagnetPdfFilename("reserve-fund-calculator.pdf")).toBe(
      "reserve-fund-calculator",
    );
    expect(
      parseLeadMagnetPdfFilename("reserve-fund-calculator.txt"),
    ).toBeNull();
    expect(parseLeadMagnetPdfFilename("unknown-slug.pdf")).toBeNull();
  });
});
