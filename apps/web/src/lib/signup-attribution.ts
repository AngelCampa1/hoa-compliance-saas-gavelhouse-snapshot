export interface SignupAttribution {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referredBy?: string;
}

export const ATTRIBUTION_STORAGE_KEY = "signup-attribution";

const ATTRIBUTION_FIELDS = [
  { param: "utm_source", field: "utmSource" },
  { param: "utm_medium", field: "utmMedium" },
  { param: "utm_campaign", field: "utmCampaign" },
  { param: "ref", field: "referredBy" },
] as const;

function hasAttribution(attribution: SignupAttribution): boolean {
  return ATTRIBUTION_FIELDS.some(
    ({ field }) => attribution[field] !== undefined,
  );
}

function mergeAttribution(
  current: SignupAttribution,
  stored: SignupAttribution,
): SignupAttribution {
  return {
    utmSource: current.utmSource ?? stored.utmSource,
    utmMedium: current.utmMedium ?? stored.utmMedium,
    utmCampaign: current.utmCampaign ?? stored.utmCampaign,
    referredBy: current.referredBy ?? stored.referredBy,
  };
}

function writeStoredSignupAttribution(attribution: SignupAttribution): void {
  if (!hasAttribution(attribution)) {
    return;
  }

  try {
    sessionStorage.setItem(
      ATTRIBUTION_STORAGE_KEY,
      JSON.stringify(attribution),
    );
  } catch {
    // ignore storage failures
  }
}

export function extractSignupAttribution(search: string): SignupAttribution {
  const params = new URLSearchParams(search);
  const attribution: SignupAttribution = {};

  for (const { param, field } of ATTRIBUTION_FIELDS) {
    const value = params.get(param);
    if (value) {
      attribution[field] = value;
    }
  }

  return attribution;
}

export function readStoredSignupAttribution(): SignupAttribution {
  try {
    const raw = sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const record = parsed as Record<string, unknown>;
    const attribution: SignupAttribution = {};

    for (const { field } of ATTRIBUTION_FIELDS) {
      const value = record[field];
      if (typeof value === "string" && value.length > 0) {
        attribution[field] = value;
      }
    }

    return attribution;
  } catch {
    return {};
  }
}

export function persistSignupAttribution(
  search = window.location.search,
): SignupAttribution {
  const current = extractSignupAttribution(search);
  if (!hasAttribution(current)) {
    return readStoredSignupAttribution();
  }

  const merged = mergeAttribution(current, readStoredSignupAttribution());
  writeStoredSignupAttribution(merged);
  return merged;
}

export function resolveSignupAttribution(
  search = window.location.search,
): SignupAttribution {
  const resolved = mergeAttribution(
    extractSignupAttribution(search),
    readStoredSignupAttribution(),
  );

  writeStoredSignupAttribution(resolved);
  return resolved;
}
