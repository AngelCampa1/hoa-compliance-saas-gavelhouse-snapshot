// Builds the inline markup, styles, and bootstrap script for the AI-SDR
// marketing widget. Kept here (not inline in the .astro layout) so the logic is
// covered by unit tests — `src/pages/**` and `*.astro` are excluded from
// coverage, but `src/lib/**` is not.
//
// The widget shell is self-contained: it defines its own `--ai-shell-*` tokens
// (Gavelhouse navy/sand palette) rather than depending on the page's brand
// CSS variables, so it renders correctly even before brand CSS is applied. The
// hosted bundle (`window.VentoraAiSdr.createAiSdrWidget`) handles the actual
// chat UI and reduced-motion behavior; the launcher transition is disabled
// under prefers-reduced-motion below.

export const AI_SDR_WIDGET_ROOT_ID = "ventora-ai-sdr-root";
export const AI_SDR_WIDGET_PRODUCT_ID = "gavelhouse";
export const AI_SDR_WIDGET_API_BASE_URL = "/api/ai-sdr";
export const AI_SDR_WIDGET_BUNDLE_URL =
  "https://ventora-ai-sdr-worker.REPLACE_WITH_WORKERS_DEV_SUBDOMAIN.workers.dev/client/ai-sdr.global.js";
export const AI_SDR_WIDGET_LAUNCHER_LABEL = "Ask about Gavelhouse";
export const AI_SDR_WIDGET_PANEL_LABEL = "Gavelhouse assistant";
export const AI_SDR_WIDGET_MAX_POLL_ATTEMPTS = 100;
export const AI_SDR_WIDGET_POLL_INTERVAL_MS = 100;

// Gavelhouse self-contained shell tokens (navy primary on a sand wash). All
// button geometry is fully rounded (border-radius:999px) per the design canon.
export function buildAiSdrWidgetStyles(): string {
  return [
    `#${AI_SDR_WIDGET_ROOT_ID}{--ai-shell-accent:#163a5f;--ai-shell-ink:#142235;--ai-shell-muted:#5d6b7d;--ai-shell-line:#d6e0ea;--ai-shell-wash:#eef3f8;position:fixed;right:20px;bottom:20px;z-index:2147483000;font-family:"Public Sans",system-ui,sans-serif}`,
    `#${AI_SDR_WIDGET_ROOT_ID} button,#${AI_SDR_WIDGET_ROOT_ID} textarea{font:inherit}`,
    `#ventora-ai-sdr-toggle{border:1px solid rgba(22,58,95,.22);border-radius:999px;background:var(--ai-shell-accent);color:#fff;box-shadow:0 18px 40px rgba(22,58,95,.25);padding:13px 17px;font-weight:800;cursor:pointer;transition:transform .16s ease,box-shadow .16s ease}`,
    `#ventora-ai-sdr-toggle:hover{transform:translateY(-1px);box-shadow:0 20px 46px rgba(22,58,95,.31)}`,
    `#ventora-ai-sdr-toggle:focus-visible,#ventora-ai-sdr-close:focus-visible{outline:3px solid rgba(22,58,95,.32);outline-offset:2px}`,
    `#ventora-ai-sdr-panel{display:none;width:min(420px,calc(100vw - 32px));max-height:min(680px,calc(100vh - 96px));overflow:hidden;border:1px solid var(--ai-shell-line);border-radius:14px;background:#fff;box-shadow:0 24px 70px rgba(20,34,53,.22)}`,
    `#ventora-ai-sdr-panel[data-open=true]{display:block}`,
    `#ventora-ai-sdr-head{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--ai-shell-line);background:var(--ai-shell-wash);padding:14px 16px;color:var(--ai-shell-ink);font-size:14px;font-weight:850}`,
    `#ventora-ai-sdr-close{min-width:36px;min-height:36px;border:1px solid transparent;border-radius:999px;background:transparent;color:var(--ai-shell-muted);font-size:22px;line-height:1;cursor:pointer}`,
    `#ventora-ai-sdr-close:hover{background:#fff;color:var(--ai-shell-ink)}`,
    `#ventora-ai-sdr-target{padding:14px;background:#fff}`,
    `@media(max-width:480px){#${AI_SDR_WIDGET_ROOT_ID}{right:12px;bottom:12px}#ventora-ai-sdr-panel{width:calc(100vw - 24px);max-height:calc(100vh - 72px)}}`,
    `@media(prefers-reduced-motion:reduce){#ventora-ai-sdr-toggle{transition:none}#ventora-ai-sdr-toggle:hover{transform:none}}`,
  ].join("");
}

export function buildAiSdrWidgetInitScript(options?: {
  rootId?: string;
  productId?: string;
  apiBaseUrl?: string;
  launcherLabel?: string;
  panelLabel?: string;
  maxAttempts?: number;
  intervalMs?: number;
}): string {
  const rootId = options?.rootId ?? AI_SDR_WIDGET_ROOT_ID;
  const productId = options?.productId ?? AI_SDR_WIDGET_PRODUCT_ID;
  const apiBaseUrl = options?.apiBaseUrl ?? AI_SDR_WIDGET_API_BASE_URL;
  const launcherLabel = options?.launcherLabel ?? AI_SDR_WIDGET_LAUNCHER_LABEL;
  const panelLabel = options?.panelLabel ?? AI_SDR_WIDGET_PANEL_LABEL;
  const maxAttempts = options?.maxAttempts ?? AI_SDR_WIDGET_MAX_POLL_ATTEMPTS;
  const intervalMs = options?.intervalMs ?? AI_SDR_WIDGET_POLL_INTERVAL_MS;

  const styles = buildAiSdrWidgetStyles();
  const shellHtml =
    `<button id="ventora-ai-sdr-toggle" type="button" aria-expanded="false">${launcherLabel}</button>` +
    `<section id="ventora-ai-sdr-panel" aria-label="${panelLabel}">` +
    `<div id="ventora-ai-sdr-head"><span>${panelLabel}</span>` +
    `<button id="ventora-ai-sdr-close" type="button" aria-label="Close">×</button></div>` +
    `<div id="ventora-ai-sdr-target"></div></section>`;

  return `(function () {
  var root = document.getElementById(${JSON.stringify(rootId)});
  if (!root) return;
  var style = document.createElement("style");
  style.textContent = ${JSON.stringify(styles)};
  document.head.appendChild(style);
  root.innerHTML = ${JSON.stringify(shellHtml)};
  var toggle = document.getElementById("ventora-ai-sdr-toggle");
  var close = document.getElementById("ventora-ai-sdr-close");
  var panel = document.getElementById("ventora-ai-sdr-panel");
  var target = document.getElementById("ventora-ai-sdr-target");
  var widget = null;
  var waitTimer = null;
  var loadingHtml = '<div role="status" style="font-size:14px;line-height:1.45;color:#5d6b7d">Loading assistant\\u2026</div>';
  var errorHtml = '<div role="alert" style="font-size:14px;line-height:1.45;color:#c2412d">Assistant failed to load. Refresh and try again.</div>';
  function createWidget() {
    if (widget) { widget.open(); return true; }
    if (!target || !window.VentoraAiSdr) return false;
    target.innerHTML = "";
    widget = window.VentoraAiSdr.createAiSdrWidget({
      target: target,
      api: { baseUrl: ${JSON.stringify(apiBaseUrl)} },
      session: { productId: ${JSON.stringify(productId)}, metadata: { surface: "marketing-site" } }
    });
    widget.open();
    return true;
  }
  function waitForWidget() {
    if (createWidget()) return;
    if (target) target.innerHTML = loadingHtml;
    if (waitTimer) return;
    var attempts = 0;
    waitTimer = window.setInterval(function () {
      attempts += 1;
      if (createWidget()) {
        window.clearInterval(waitTimer);
        waitTimer = null;
        return;
      }
      if (attempts >= ${maxAttempts}) {
        window.clearInterval(waitTimer);
        waitTimer = null;
        if (target && !widget) target.innerHTML = errorHtml;
      }
    }, ${intervalMs});
  }
  function openPanel() {
    panel.setAttribute("data-open", "true");
    toggle.setAttribute("aria-expanded", "true");
    waitForWidget();
  }
  function closePanel() {
    panel.removeAttribute("data-open");
    toggle.setAttribute("aria-expanded", "false");
  }
  toggle.addEventListener("click", openPanel);
  close.addEventListener("click", closePanel);
})();`;
}
