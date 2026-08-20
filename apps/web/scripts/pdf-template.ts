import type { TocEntry } from "./extract-toc.js";
import {
  BRAND_DOMAIN,
  PUBLIC_WEB_URL,
  TRIAL_DURATION_DAYS,
} from "@boardstack/shared";

export interface RenderPdfHtmlInput {
  title: string;
  description: string;
  bluf: string;
  publishedAt: string;
  bodyHtml: string;
  toc: TocEntry[];
}

const NAVY = "#0f172a";
const ACCENT = "#d97706";
const BODY_INK = "#1f2937";
const MUTED = "#475569";
const RULE = "#e2e8f0";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(iso: string): string {
  // Parse YYYY-MM-DD without timezone drift.
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

function renderToc(toc: TocEntry[]): string {
  if (toc.length === 0) {
    return `<p class="toc-empty">This document has no sections.</p>`;
  }
  const items = toc
    .map(
      (entry, idx) =>
        `<li><span class="toc-num">${String(idx + 1).padStart(2, "0")}</span><span class="toc-text">${escapeHtml(entry.text)}</span></li>`,
    )
    .join("");
  return `<ol class="toc-list">${items}</ol>`;
}

export function renderPdfHtml(input: RenderPdfHtmlInput): string {
  const { title, description, bluf, publishedAt, bodyHtml, toc } = input;
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeBluf = escapeHtml(bluf);
  const prettyDate = formatDate(publishedAt);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${safeTitle}</title>
    <style>
      @page { size: A4; margin: 20mm; }

      * { box-sizing: border-box; }

      html, body {
        margin: 0;
        padding: 0;
        color: ${BODY_INK};
        font-family: "Iowan Old Style", "Palatino Linotype", Georgia, "Times New Roman", serif;
        font-size: 11pt;
        line-height: 1.55;
      }

      h1, h2, h3, h4, .sans {
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
          "Helvetica Neue", Arial, sans-serif;
        color: ${NAVY};
      }

      a { color: ${NAVY}; text-decoration: underline; }

      /* ---------- Cover page ---------- */
      .cover {
        page-break-after: always;
        position: relative;
        min-height: calc(297mm - 40mm);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 8mm 4mm 4mm 4mm;
      }
      .cover-accent {
        height: 10mm;
        width: 55mm;
        background: ${ACCENT};
        border-radius: 2px;
        margin-bottom: 14mm;
      }
      .cover-eyebrow {
        font-family: ui-sans-serif, system-ui, sans-serif;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-size: 9pt;
        color: ${ACCENT};
        font-weight: 700;
        margin-bottom: 6mm;
      }
      .cover-title {
        font-size: 32pt;
        line-height: 1.1;
        font-weight: 800;
        margin: 0 0 8mm 0;
        color: ${NAVY};
      }
      .cover-subtitle {
        font-size: 13pt;
        line-height: 1.45;
        color: ${MUTED};
        margin: 0 0 12mm 0;
        max-width: 140mm;
      }
      .cover-bluf {
        border: 1px solid ${ACCENT};
        background: #f7efe1;
        padding: 6mm 8mm;
        font-size: 11pt;
        line-height: 1.55;
        color: ${BODY_INK};
        margin: 0 0 12mm 0;
      }
      .cover-bluf-label {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 9pt;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: ${ACCENT};
        font-weight: 700;
        display: block;
        margin-bottom: 2mm;
      }
      .cover-footer {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 10pt;
        color: ${MUTED};
        border-top: 1px solid ${RULE};
        padding-top: 4mm;
      }
      .wordmark {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-weight: 800;
        color: ${NAVY};
        font-size: 12pt;
        letter-spacing: -0.01em;
      }
      .wordmark-dot { color: ${ACCENT}; }

      /* ---------- TOC page ---------- */
      .toc {
        page-break-before: always;
        page-break-after: always;
      }
      .toc h2 {
        font-size: 18pt;
        margin: 0 0 8mm 0;
        padding-bottom: 3mm;
        border-bottom: 2px solid ${NAVY};
      }
      .toc-list {
        list-style: none;
        margin: 0;
        padding: 0;
        counter-reset: item;
      }
      .toc-list li {
        display: flex;
        align-items: baseline;
        gap: 5mm;
        padding: 3mm 0;
        border-bottom: 1px dotted ${RULE};
        page-break-inside: avoid;
      }
      .toc-num {
        font-family: ui-sans-serif, system-ui, sans-serif;
        color: ${ACCENT};
        font-weight: 700;
        font-size: 10pt;
        min-width: 10mm;
      }
      .toc-text {
        font-family: ui-sans-serif, system-ui, sans-serif;
        color: ${NAVY};
        font-size: 11pt;
      }
      .toc-empty {
        color: ${MUTED};
        font-style: italic;
      }

      /* ---------- Body ---------- */
      .body h2 {
        font-size: 16pt;
        margin: 10mm 0 4mm 0;
        padding-bottom: 2mm;
        border-bottom: 1px solid ${RULE};
        page-break-after: avoid;
        page-break-inside: avoid;
      }
      .body h3 {
        font-size: 12.5pt;
        margin: 6mm 0 2mm 0;
        page-break-after: avoid;
        page-break-inside: avoid;
      }
      .body h4 {
        font-size: 11pt;
        margin: 5mm 0 1mm 0;
        page-break-after: avoid;
      }
      .body p { margin: 0 0 3mm 0; }
      .body ul, .body ol { margin: 0 0 3mm 0; padding-left: 6mm; }
      .body li { margin: 1mm 0; }
      .body strong { color: ${NAVY}; }
      .body code {
        font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
        background: #f1f5f9;
        padding: 0.5mm 1.5mm;
        border-radius: 2px;
        font-size: 10pt;
      }
      .body pre {
        background: #f8fafc;
        border: 1px solid ${RULE};
        border-radius: 3px;
        padding: 3mm 4mm;
        overflow: hidden;
        white-space: pre-wrap;
        font-size: 9.5pt;
        page-break-inside: avoid;
      }
      .body blockquote {
        border: 1px solid ${ACCENT};
        border-top: 4px solid ${ACCENT};
        margin: 3mm 0;
        padding: 2mm 4mm;
        color: ${MUTED};
        background: #f7efe1;
      }
      .body table {
        width: 100%;
        border-collapse: collapse;
        margin: 4mm 0;
        font-size: 10pt;
        page-break-inside: avoid;
      }
      .body th, .body td {
        border: 1px solid ${RULE};
        padding: 2mm 3mm;
        text-align: left;
        vertical-align: top;
      }
      .body th {
        background: #f8fafc;
        color: ${NAVY};
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-weight: 700;
      }
      .body img { max-width: 100%; height: auto; }

      /* ---------- Back page ---------- */
      .back {
        page-break-before: always;
        text-align: center;
        padding-top: 40mm;
      }
      .back-accent {
        width: 40mm;
        height: 6mm;
        background: ${ACCENT};
        margin: 0 auto 10mm auto;
        border-radius: 2px;
      }
      .back h2 {
        font-size: 22pt;
        color: ${NAVY};
        margin: 0 0 6mm 0;
      }
      .back p {
        font-size: 12pt;
        color: ${MUTED};
        max-width: 120mm;
        margin: 0 auto 6mm auto;
        line-height: 1.6;
      }
      .back-cta {
        display: inline-block;
        background: ${NAVY};
        color: #fff;
        padding: 4mm 10mm;
        border-radius: 3px;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-weight: 700;
        font-size: 12pt;
        text-decoration: none;
        margin-bottom: 8mm;
      }
      .back-url {
        font-family: ui-sans-serif, system-ui, sans-serif;
        color: ${NAVY};
        font-weight: 700;
        font-size: 11pt;
        letter-spacing: 0.02em;
      }
      .back-tagline {
        margin-top: 14mm;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 9.5pt;
        color: ${MUTED};
        text-transform: uppercase;
        letter-spacing: 0.14em;
      }
    </style>
  </head>
  <body>
    <section class="cover">
      <div>
        <div class="cover-accent"></div>
        <div class="cover-eyebrow">Gavelhouse Guide</div>
        <h1 class="cover-title">${safeTitle}</h1>
        <p class="cover-subtitle">${safeDescription}</p>
        <div class="cover-bluf">
          <span class="cover-bluf-label">Bottom Line Up Front</span>
          ${safeBluf}
        </div>
      </div>
      <div class="cover-footer">
        <span class="wordmark">Gavelhouse<span class="wordmark-dot">.</span>app</span>
        <span>${escapeHtml(prettyDate)}</span>
      </div>
    </section>

    <section class="toc">
      <h2>Contents</h2>
      ${renderToc(toc)}
    </section>

    <section class="body">
      ${bodyHtml}
    </section>

    <section class="back">
      <div class="back-accent"></div>
      <h2>Start your ${TRIAL_DURATION_DAYS}-day free trial</h2>
      <p>Reserve fund compliance, state-specific rules, and personal liability protection built into the product — not bolted on. No credit card required. Add billing before the trial ends to keep access.</p>
      <a class="back-cta" href="${PUBLIC_WEB_URL}/">Get Started</a>
      <div class="back-url">${BRAND_DOMAIN}</div>
      <div class="back-tagline">Compliance-first HOA management for self-managed boards</div>
    </section>
  </body>
</html>`;
}
