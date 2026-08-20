import { knowledgeBase } from "@boardstack/shared";

const PRODUCTION_API_URL = `https://api.${knowledgeBase.marketing.product.domain}`;
const PRODUCTION_APP_URL = new URL(
  knowledgeBase.marketing.funnel.publicSignupUrl,
).origin;

function parsePublicUrl(value: string | undefined): URL | null {
  if (value === undefined || value.trim().length === 0) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function isUsablePublicUrl(
  value: string | undefined,
  dev: boolean,
): value is string {
  const parsed = parsePublicUrl(value);
  if (!parsed) {
    return false;
  }

  if (dev) {
    return true;
  }

  const isLocalhost =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  const hostname = parsed.hostname.replace(/\.$/, "");
  const isLegacyPublicHost =
    hostname === "boardstack.app" || hostname.endsWith(".boardstack.app");

  return parsed.protocol === "https:" && !isLocalhost && !isLegacyPublicHost;
}

type ResolvePublicUrlOptions = {
  dev?: boolean;
};

export function resolvePublicApiUrl(
  value: string | undefined,
  options: ResolvePublicUrlOptions = {},
): string {
  const dev = options.dev ?? import.meta.env.DEV;
  if (isUsablePublicUrl(value, dev)) {
    return value;
  }

  return dev ? "http://localhost:8060" : PRODUCTION_API_URL;
}

export function resolvePublicAppUrl(
  value: string | undefined,
  options: ResolvePublicUrlOptions = {},
): string {
  const dev = options.dev ?? import.meta.env.DEV;
  if (isUsablePublicUrl(value, dev)) {
    return value;
  }

  return dev ? "http://localhost:3060" : PRODUCTION_APP_URL;
}
