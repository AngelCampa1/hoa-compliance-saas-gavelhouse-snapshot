import * as React from "react";

/**
 * Minimal markdown-to-JSX helper for transactional email bodies.
 *
 * Supports three constructs only, which is enough for our nurture templates:
 *  - Paragraph breaks: `\n\n`
 *  - Bold: `**text**`
 *  - Links: `[text](url)`
 *
 * All non-markdown characters are rendered as plain text. React handles the
 * text escaping, so raw HTML in the source markdown is never injected into
 * the final HTML output.
 */

type InlineToken =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "link"; text: string; url: string };

const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;
const BOLD_RE = /\*\*([^*]+)\*\*/g;

function tokenizeInline(line: string): InlineToken[] {
  // First pass: pull out links into placeholder tokens so later passes do not
  // walk into the URL. We splice the string into alternating text / link
  // segments, then run bold parsing over each text segment.
  const tokens: InlineToken[] = [];

  let cursor = 0;
  for (const match of line.matchAll(LINK_RE)) {
    const start = match.index;
    if (start > cursor) {
      tokens.push(...tokenizeBold(line.slice(cursor, start)));
    }
    tokens.push({ type: "link", text: match[1], url: match[2] });
    cursor = start + match[0].length;
  }
  if (cursor < line.length) {
    tokens.push(...tokenizeBold(line.slice(cursor)));
  }
  return tokens;
}

function tokenizeBold(segment: string): InlineToken[] {
  const out: InlineToken[] = [];
  let cursor = 0;
  for (const match of segment.matchAll(BOLD_RE)) {
    const start = match.index;
    if (start > cursor) {
      out.push({ type: "text", value: segment.slice(cursor, start) });
    }
    out.push({ type: "bold", value: match[1] });
    cursor = start + match[0].length;
  }
  if (cursor < segment.length) {
    out.push({ type: "text", value: segment.slice(cursor) });
  }
  return out;
}

const SAFE_HREF_RE = /^https?:\/\//i;

function renderTokens(
  tokens: InlineToken[],
  keyPrefix: string,
): React.ReactNode[] {
  return tokens.map((tok, idx) => {
    const key = `${keyPrefix}:${idx}`;
    if (tok.type === "text")
      return <React.Fragment key={key}>{tok.value}</React.Fragment>;
    if (tok.type === "bold") return <strong key={key}>{tok.value}</strong>;
    // Only http(s) URLs are rendered as anchor tags. Other schemes
    // (javascript:, data:, mailto:, vbscript:, file:, etc.) are rendered as
    // plain text so a malicious or misconfigured link in content cannot
    // smuggle an unsafe href into a customer inbox.
    if (!SAFE_HREF_RE.test(tok.url)) {
      return <React.Fragment key={key}>{tok.text}</React.Fragment>;
    }
    return (
      <a
        key={key}
        href={tok.url}
        style={{ color: "#2563eb", textDecoration: "underline" }}
      >
        {tok.text}
      </a>
    );
  });
}

export function renderMarkdownBlocks(markdown: string): React.ReactNode[] {
  const normalized = markdown.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) return [];

  const paragraphs = normalized.split(/\n{2,}/);
  return paragraphs.map((para, pIdx) => {
    const tokens = tokenizeInline(para);
    return (
      <p
        key={`p:${pIdx}`}
        style={{
          margin: "0 0 16px 0",
          fontSize: "16px",
          lineHeight: "24px",
          color: "#1f2937",
        }}
      >
        {renderTokens(tokens, `p:${pIdx}`)}
      </p>
    );
  });
}
