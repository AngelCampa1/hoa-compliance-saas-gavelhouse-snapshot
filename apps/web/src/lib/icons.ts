/**
 * Accessible inline SVG icon strings for use in both Astro (`set:html`)
 * and React (`dangerouslySetInnerHTML`) components.
 *
 * Each icon uses `role="img"` with an `aria-label` so screen readers
 * announce the semantic meaning instead of raw Unicode characters.
 * When used decoratively, wrap with `aria-hidden="true"` on the parent.
 */

export const CheckIcon = `<svg role="img" aria-label="yes" focusable="false" width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M11.03 3.97a.75.75 0 0 1 0 1.06l-5 5a.75.75 0 0 1-1.06 0l-2.5-2.5a.75.75 0 1 1 1.06-1.06L5.5 8.44l4.47-4.47a.75.75 0 0 1 1.06 0z"/></svg>`;

/**
 * Decorative variant of CheckIcon with aria-hidden="true".
 * Use this when the parent element already carries the accessible label
 * (e.g. a <span aria-label="...">) to avoid double ARIA announcements.
 */
export const CheckIconHidden = `<svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M11.03 3.97a.75.75 0 0 1 0 1.06l-5 5a.75.75 0 0 1-1.06 0l-2.5-2.5a.75.75 0 1 1 1.06-1.06L5.5 8.44l4.47-4.47a.75.75 0 0 1 1.06 0z"/></svg>`;

export const CrossIcon = `<svg role="img" aria-label="no" focusable="false" width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M3.47 3.47a.75.75 0 0 1 1.06 0L7 5.94l2.47-2.47a.75.75 0 1 1 1.06 1.06L8.06 7l2.47 2.47a.75.75 0 1 1-1.06 1.06L7 8.06l-2.47 2.47a.75.75 0 1 1-1.06-1.06L5.94 7 3.47 4.53a.75.75 0 0 1 0-1.06z"/></svg>`;

/**
 * Decorative variant of CrossIcon with aria-hidden="true".
 * Use this when the parent element already carries the accessible label
 * to avoid double ARIA announcements.
 */
export const CrossIconHidden = `<svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M3.47 3.47a.75.75 0 0 1 1.06 0L7 5.94l2.47-2.47a.75.75 0 1 1 1.06 1.06L8.06 7l2.47 2.47a.75.75 0 1 1-1.06 1.06L7 8.06l-2.47 2.47a.75.75 0 1 1-1.06-1.06L5.94 7 3.47 4.53a.75.75 0 0 1 0-1.06z"/></svg>`;

export const ChevronRightIcon = `<svg role="img" aria-label="next" focusable="false" width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M5.22 3.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L7.94 7 5.22 4.28a.75.75 0 0 1 0-1.06z"/></svg>`;

export const PlusIcon = `<svg role="img" aria-label="expand" focusable="false" width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M7 1.75a.75.75 0 0 1 .75.75v3.75h3.75a.75.75 0 0 1 0 1.5H7.75v3.75a.75.75 0 0 1-1.5 0V7.75H2.5a.75.75 0 0 1 0-1.5h3.75V2.5A.75.75 0 0 1 7 1.75z"/></svg>`;

export const MinusIcon = `<svg role="img" aria-label="collapse" focusable="false" width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M2.5 6.25a.75.75 0 0 0 0 1.5h9a.75.75 0 0 0 0-1.5h-9z"/></svg>`;
