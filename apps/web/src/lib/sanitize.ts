/**
 * Strips </script> sequences and control characters from strings used in JSON-LD.
 * Prevents script injection when schema properties contain user-controlled content.
 */
export function sanitizeJsonLd(value: string): string {
  return (
    value
      .replace(/<\/script/gi, (match) => match.replace("/", "\\/")) // escape closing script tags, preserve case
      // eslint-disable-next-line no-control-regex -- intentionally strips C0/C1 control chars from JSON-LD output to prevent injection via Unicode control sequences
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
  ); // strip control characters
}

/**
 * Validates a URL is safe (http/https or relative). Returns "#" for unsafe URLs.
 * Prevents javascript: URI injection in href attributes.
 */
export function sanitizeHref(url: string): string {
  if (!url) return "#";
  // Allow fragment-only URLs
  if (url.startsWith("#")) return url;
  // Allow absolute relative URLs (start with / but not //)
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  // Allow explicitly relative URLs (start with ./)
  if (url.startsWith("./")) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return url;
    return "#";
  } catch {
    return "#";
  }
}

/**
 * Strips dangerous elements from rendered markdown HTML.
 * Removes <script>, <iframe>, <object>, <embed>, <form> tags and their content,
 * plus on* event handler attributes. Intended for HTML produced by Astro's
 * markdown pipeline where full sanitization is overkill but script injection
 * should be blocked as defense-in-depth.
 */
export function sanitizeHtml(html: string): string {
  return (
    html
      // Strip dangerous tags and their content
      .replace(/<(script|iframe|object|embed|form)\b[^]*?<\/\1\s*>/gi, "")
      // Strip self-closing dangerous tags (e.g. <script />, <iframe />)
      .replace(/<(script|iframe|object|embed)\b[^>]*\/?\s*>/gi, "")
      // Strip on* event handler attributes from remaining tags
      .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      // Strip javascript: URIs in href/src/action attributes
      .replace(
        /(\s(?:href|src|action)\s*=\s*(?:"|'))javascript:[^"']*("|')/gi,
        "$1#$2",
      )
  );
}

/**
 * Sanitizes pagefind excerpt HTML. Only allows bare <mark> and </mark> tags;
 * strips all other tags and strips attributes from mark tags.
 * Prevents XSS from poisoned pagefind indexes.
 */
export function sanitizeExcerpt(html: string): string {
  return (
    html
      // Normalize <mark ...attrs...> to bare <mark> -- strips attributes
      .replace(/<mark\b[^>]*>/gi, "<mark>")
      // Normalize </mark ...> to bare </mark>
      .replace(/<\/mark\b[^>]*>/gi, "</mark>")
      // Strip all remaining tags that are not bare <mark> or </mark>
      .replace(/<(?!\/?mark>)[^>]*>/g, "")
      .replace(/javascript:/gi, "")
  );
}
