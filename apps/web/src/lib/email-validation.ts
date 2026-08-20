// Stricter than the common /^[^\s@]+@[^\s@]+\.[^\s@]+$/: local part must start
// and end with a non-dot character, no consecutive dots allowed, TLD must be
// at least 2 alpha characters (no digits-only TLDs).
export const EMAIL_REGEX =
  /^[a-zA-Z0-9_%+-]+(\.[a-zA-Z0-9_%+-]+)*@[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
