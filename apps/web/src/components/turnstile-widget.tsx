import { useEffect, useRef } from "react";

interface TurnstileRenderParams {
  sitekey: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
}

interface TurnstileInstance {
  render: (
    container: HTMLElement,
    params: TurnstileRenderParams,
  ) => string | undefined;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileInstance;
  }
}

interface TurnstileWidgetProps {
  onVerify: (token: string | undefined) => void;
  siteKey?: string;
}

const TURNSTILE_SCRIPT_ID = "cf-turnstile-script";
const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js";

function injectTurnstileScript(): void {
  if (document.getElementById(TURNSTILE_SCRIPT_ID)) {
    return;
  }
  const script = document.createElement("script");
  script.id = TURNSTILE_SCRIPT_ID;
  script.src = TURNSTILE_SCRIPT_SRC;
  script.async = true;
  document.head.appendChild(script);
}

function renderWidget(
  container: HTMLElement,
  sitekey: string,
  cancelled: { value: boolean },
  onVerify: (token: string | undefined) => void,
): string | undefined {
  return window.turnstile!.render(container, {
    sitekey,
    callback: (token: string) => {
      if (!cancelled.value) onVerify(token);
    },
    "expired-callback": () => {
      if (!cancelled.value) onVerify(undefined);
    },
    "error-callback": () => {
      if (!cancelled.value) onVerify(undefined);
    },
  });
}

export function TurnstileWidget({ onVerify, siteKey }: TurnstileWidgetProps) {
  const resolvedKey =
    siteKey ?? import.meta.env.PUBLIC_TURNSTILE_SITE_KEY ?? "";
  if (import.meta.env.PROD && !resolvedKey) {
    throw new Error(
      "PUBLIC_TURNSTILE_SITE_KEY is required for public form bot protection.",
    );
  }
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!resolvedKey) {
      return;
    }

    injectTurnstileScript();

    const cancelled = { value: false };

    function cleanup() {
      cancelled.value = true;
      if (widgetIdRef.current !== undefined && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = undefined;
      }
    }

    if (window.turnstile) {
      widgetIdRef.current = renderWidget(
        containerRef.current!,
        resolvedKey,
        cancelled,
        onVerify,
      );
      return cleanup;
    }

    const interval = setInterval(() => {
      if (window.turnstile) {
        clearInterval(interval);
        widgetIdRef.current = renderWidget(
          containerRef.current!,
          resolvedKey,
          cancelled,
          onVerify,
        );
      }
    }, 100);

    return () => {
      clearInterval(interval);
      cleanup();
    };
  }, [resolvedKey, onVerify]);

  if (!resolvedKey) {
    return null;
  }

  return <div ref={containerRef} />;
}
