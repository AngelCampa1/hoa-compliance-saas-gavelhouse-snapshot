import {
  LEAD_MAGNET_DOWNLOAD_LINK_EXPIRY_DAYS,
  LEAD_MAGNET_SLUGS,
  PUBLIC_API_URL,
  type LeadMagnetSlug,
} from "@boardstack/shared";
import type { Env } from "../types/env.js";
import { timingSafeEqual } from "./timingSafeEqual.js";

export const LEAD_MAGNET_DOWNLOAD_TTL_SECONDS =
  LEAD_MAGNET_DOWNLOAD_LINK_EXPIRY_DAYS * 24 * 60 * 60;

type SignedDownloadInput = {
  slug: LeadMagnetSlug | string;
  env: Pick<Env, "PUBLIC_API_URL" | "LEAD_MAGNET_DOWNLOAD_SECRET">;
  now?: Date;
};

type VerifyDownloadInput = {
  slug: LeadMagnetSlug | string;
  expires: string | null;
  signature: string | null;
  env: Pick<Env, "LEAD_MAGNET_DOWNLOAD_SECRET">;
  now?: Date;
};

function isKnownLeadMagnetSlug(slug: string): slug is LeadMagnetSlug {
  return (LEAD_MAGNET_SLUGS as readonly string[]).includes(slug);
}

function getDownloadSecret(
  env: Pick<Env, "LEAD_MAGNET_DOWNLOAD_SECRET">,
): string {
  const secret = env.LEAD_MAGNET_DOWNLOAD_SECRET;
  if (!secret) {
    throw new Error("LEAD_MAGNET_DOWNLOAD_SECRET is not configured.");
  }
  return secret;
}

function getPublicApiUrl(env: Pick<Env, "PUBLIC_API_URL">): string {
  return env.PUBLIC_API_URL ?? PUBLIC_API_URL;
}

function getUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message),
  );
  return toHex(signature);
}

function signaturePayload(slug: string, expires: number): string {
  return `${slug}:${expires}`;
}

export async function signLeadMagnetDownload(
  slug: LeadMagnetSlug,
  expires: number,
  env: Pick<Env, "LEAD_MAGNET_DOWNLOAD_SECRET">,
): Promise<string> {
  return hmacSha256Hex(getDownloadSecret(env), signaturePayload(slug, expires));
}

export async function buildSignedLeadMagnetDownloadUrl(
  input: SignedDownloadInput,
): Promise<string> {
  if (!isKnownLeadMagnetSlug(input.slug)) {
    throw new Error(`Unknown lead magnet slug: ${input.slug}`);
  }

  const expires =
    getUnixSeconds(input.now ?? new Date()) + LEAD_MAGNET_DOWNLOAD_TTL_SECONDS;
  const signature = await signLeadMagnetDownload(
    input.slug,
    expires,
    input.env,
  );
  const url = new URL(
    `/downloads/${input.slug}.pdf`,
    getPublicApiUrl(input.env),
  );
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("signature", signature);
  return url.toString();
}

export async function verifyLeadMagnetDownloadSignature(
  input: VerifyDownloadInput,
): Promise<boolean> {
  if (!isKnownLeadMagnetSlug(input.slug)) return false;
  if (!input.expires || !/^\d+$/.test(input.expires)) return false;
  if (!input.signature || !/^[a-f0-9]{64}$/.test(input.signature)) {
    return false;
  }

  const expires = Number(input.expires);
  const now = getUnixSeconds(input.now ?? new Date());
  if (!Number.isSafeInteger(expires) || expires < now) return false;

  const expected = await signLeadMagnetDownload(input.slug, expires, input.env);
  return timingSafeEqual(expected, input.signature);
}

export function getLeadMagnetObjectKey(slug: LeadMagnetSlug): string {
  return `${slug}.pdf`;
}

export function parseLeadMagnetPdfFilename(
  filename: string,
): LeadMagnetSlug | null {
  if (!filename.endsWith(".pdf")) return null;
  const slug = filename.slice(0, -".pdf".length);
  return isKnownLeadMagnetSlug(slug) ? slug : null;
}
