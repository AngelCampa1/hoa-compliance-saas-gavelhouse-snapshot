import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// In-depth integration test: drives the REAL @ventora/ai-cs widget (NOT a
// stub) through AiCsSupportWidget against a fetch stub that implements the
// boardstack BFF contract end to end — session create (201), chat as a real
// Server-Sent Events stream, and escalation (202). This proves the widget +
// BFF wiring and boardstack brand adaptation without any live worker/LLM/DB.

vi.mock("@/lib/api", () => ({
  getApiBase: () => "https://api.test.gavelhouse.app",
}));

import { AiCsSupportWidget } from "@/components/ai-cs-support-widget";

const BASE = "https://api.test.gavelhouse.app/api/ai-cs";

/** Build a text/event-stream Response body from raw SSE frames. */
function sseResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

const calls: Array<{ url: string; method: string; body: unknown }> = [];

function installBffStub() {
  const stub = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ url, method, body });

      if (url === `${BASE}/v1/sessions` && method === "POST") {
        return new Response(JSON.stringify({ sessionId: "cs_e2e_1" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === `${BASE}/v1/chat` && method === "POST") {
        return sseResponse([
          'event: message.delta\ndata: {"messageId":"m1","delta":"Hello "}\n\n',
          'event: message.delta\ndata: {"messageId":"m1","delta":"there"}\n\n',
          'event: message.done\ndata: {"messageId":"m1"}\n\n',
        ]);
      }
      if (url === `${BASE}/v1/escalations` && method === "POST") {
        return new Response(
          JSON.stringify({ escalationId: "esc_1", status: "queued" }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`unexpected request: ${method} ${url}`);
    },
  );
  vi.stubGlobal("fetch", stub);
}

beforeEach(() => {
  calls.length = 0;
  installBffStub();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Skipped since this repository was opened up. `@ventora/ai-cs` is private and
// cannot be published here, so `packages/ai-cs-stub` shadows it with an inert
// component. Every assertion below exercises the real vendor widget's SSE and
// escalation protocol, which the stub deliberately does not implement. Kept
// rather than deleted as the record of how that integration was verified.
describe.skip("AI-CS support widget end-to-end flow (stubbed BFF)", () => {
  it("opens, streams an assistant reply over SSE, and escalates to a human", async () => {
    const user = userEvent.setup();
    render(<AiCsSupportWidget userId="u-1" currentPath="/dashboard" />);

    // The floating launcher is mounted for the authenticated user.
    const launcher = await screen.findByRole("button", { name: /get help/i });
    await user.click(launcher);

    // Opening the panel eagerly creates a session against the BFF.
    await waitFor(() => {
      expect(
        calls.some(
          (c) => c.url === `${BASE}/v1/sessions` && c.method === "POST",
        ),
      ).toBe(true);
    });

    // Compose a message that also trips the negative-sentiment gate so the
    // "talk to a human" escalation affordance becomes available.
    const textarea = await screen.findByRole("textbox");
    await user.type(textarea, "this is broken, I need a human");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    // The streamed assistant reply renders from the message.delta frames.
    await screen.findByText("Hello there");

    // The chat request carried the established sessionId and the message.
    const chat = calls.find((c) => c.url === `${BASE}/v1/chat`);
    expect(chat).toBeDefined();
    expect((chat!.body as { sessionId: string }).sessionId).toBe("cs_e2e_1");
    expect((chat!.body as { message: string }).message).toContain("a human");

    // Escalate → the BFF receives the escalation and the queued banner shows.
    const escalate = await screen.findByRole("button", {
      name: /talk to a human/i,
    });
    await user.click(escalate);

    const escalation = await waitFor(() => {
      const c = calls.find((x) => x.url === `${BASE}/v1/escalations`);
      expect(c).toBeDefined();
      return c!;
    });
    expect((escalation.body as { sessionId: string }).sessionId).toBe(
      "cs_e2e_1",
    );

    const banner = await screen.findByText(/request queued/i);
    expect(
      within(banner.closest("[data-aics-banner]")!).queryByText(/queued/i),
    ).not.toBeNull();
  });

  it("applies the boardstack brand accent to the widget root", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AiCsSupportWidget userId="u-1" currentPath="/dashboard" />,
    );

    await user.click(await screen.findByRole("button", { name: /get help/i }));

    // resolveAiCsBrand({id:"boardstack"}) injects the boardstack accent as an
    // inline CSS custom property on the widget root, adapting the widget to the
    // product brand rather than the default Ventora slate.
    const root =
      document.querySelector<HTMLElement>("[data-aics-root]") ??
      container.querySelector<HTMLElement>("[data-aics-root]");
    expect(root).not.toBeNull();
    expect(root!.style.getPropertyValue("--aics-accent")).toBe("#2563eb");
  });
});
