import { beforeEach, vi } from "vitest";

const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const originalFetch = globalThis.fetch?.bind(globalThis);
const delegateKey = "__boardstackResendGuardDelegate";

type FetchDelegate = typeof fetch;
type GuardedFetch = FetchDelegate & {
  [delegateKey]?: FetchDelegate;
};

function getFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

beforeEach(() => {
  const currentFetch = globalThis.fetch as GuardedFetch | undefined;
  const delegate = currentFetch?.[delegateKey] ?? currentFetch ?? originalFetch;
  const guardedFetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = getFetchUrl(input);

    if (url === RESEND_EMAILS_URL) {
      throw new Error(
        "Tests must not call Resend; mock the mailer module instead.",
      );
    }

    if (!delegate) {
      throw new Error(`Unhandled fetch in test: ${url}`);
    }

    return delegate(input, init);
  }) as GuardedFetch;
  guardedFetch[delegateKey] = delegate;

  vi.stubGlobal("fetch", guardedFetch);
});
