/**
 * Owner portal token expiry tracking.
 *
 * Tokens are opaque random strings — they carry no client-readable expiry.
 * We track when we first saw the token so we can short-circuit before making
 * a network request when the token is clearly stale (> 30 days).
 */

/** 30 days in milliseconds — matches server-side TTL. */
export const OWNER_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function storageKey(token: string): string {
  return `owner-portal-token-seen:${token}`;
}

/**
 * Record that we first saw this token at the current time.
 * Call this once when the token is read from the URL.
 * No-op if the token was already recorded.
 */
export function recordOwnerTokenSeen(
  token: string,
  storage: Storage = localStorage,
): void {
  const key = storageKey(token);
  if (!storage.getItem(key)) {
    storage.setItem(key, String(Date.now()));
  }
}

/**
 * Return true if the token was first seen more than TTL_MS ago.
 * Returns false when there is no recorded timestamp (treat as fresh).
 */
export function isOwnerTokenExpired(
  token: string,
  storage: Storage = localStorage,
  nowMs: number = Date.now(),
): boolean {
  const raw = storage.getItem(storageKey(token));
  if (raw === null) return false;
  const seen = parseInt(raw, 10);
  if (isNaN(seen)) return false;
  return nowMs - seen >= OWNER_TOKEN_TTL_MS;
}
