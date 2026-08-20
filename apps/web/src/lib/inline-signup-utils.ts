export function resolveInlineSignupKicker(
  kickerText?: string,
): string | undefined {
  const trimmed = kickerText?.trim();
  return trimmed ? trimmed : undefined;
}
