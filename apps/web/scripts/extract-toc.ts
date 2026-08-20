export interface TocEntry {
  level: 2;
  text: string;
  slug: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Extract level-2 (`## `) headings from a markdown string.
 * - Ignores `#`, `###`, and deeper headings.
 * - Ignores `##` lines inside fenced code blocks (``` ... ```).
 * - Deduplicates repeated slugs by appending `-2`, `-3`, ...
 */
export function extractToc(markdown: string): TocEntry[] {
  if (!markdown) return [];

  const entries: TocEntry[] = [];
  const slugCounts = new Map<string, number>();
  let inFence = false;

  const lines = markdown.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = /^##[ \t]+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;

    const text = match[1].replace(/\s+$/g, "");
    const baseSlug = slugify(text);
    const count = (slugCounts.get(baseSlug) ?? 0) + 1;
    slugCounts.set(baseSlug, count);
    const slug = count === 1 ? baseSlug : `${baseSlug}-${count}`;

    entries.push({ level: 2, text, slug });
  }

  return entries;
}
