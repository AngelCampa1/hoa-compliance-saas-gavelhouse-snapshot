const DEFAULT_FAQ_HEADING = "Common questions before you try it";

export function resolveFaqHeading(heading?: string): string {
  if (heading?.trim()) {
    return heading;
  }

  return DEFAULT_FAQ_HEADING;
}
