import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockProviders } = vi.hoisted(() => ({
  mockProviders: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    auth: {
      providers: mockProviders,
    },
  },
}));

import {
  authClient,
  getAuthProviders,
  sendVerificationEmail,
} from "@/lib/auth";

describe("authClient baseURL fallback branch", () => {
  let savedViteApiUrl: string | undefined;

  beforeEach(() => {
    savedViteApiUrl = import.meta.env["VITE_API_URL"] as string | undefined;
  });

  afterEach(() => {
    if (savedViteApiUrl === undefined) {
      delete (import.meta.env as Record<string, unknown>)["VITE_API_URL"];
    } else {
      (import.meta.env as Record<string, unknown>)["VITE_API_URL"] =
        savedViteApiUrl;
    }
    vi.resetModules();
  });

  it("falls back to localhost:8060 when VITE_API_URL is not set", async () => {
    delete (import.meta.env as Record<string, unknown>)["VITE_API_URL"];
    vi.resetModules();
    const { authClient: freshClient } = await import("@/lib/auth");
    expect(freshClient).toBeDefined();
  });
});

describe("authClient", () => {
  it("is created and not null", () => {
    expect(authClient).toBeDefined();
    expect(authClient).not.toBeNull();
  });

  it("exposes signIn.email method", () => {
    expect(authClient.signIn).toBeDefined();
    expect(typeof authClient.signIn.email).toBe("function");
  });

  it("exposes signUp.email method", () => {
    expect(authClient.signUp).toBeDefined();
    expect(typeof authClient.signUp.email).toBe("function");
  });

  it("exposes signOut method", () => {
    expect(typeof authClient.signOut).toBe("function");
  });

  it("exposes useSession hook", () => {
    expect(typeof authClient.useSession).toBe("function");
  });
});

describe("getAuthProviders", () => {
  beforeEach(() => {
    mockProviders.mockReset();
  });

  it("returns provider capability flags from the API", async () => {
    mockProviders.mockResolvedValue({ google: true });

    await expect(getAuthProviders()).resolves.toEqual({ google: true });
    expect(mockProviders).toHaveBeenCalledTimes(1);
  });
});

describe("sendVerificationEmail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (import.meta.env as Record<string, unknown>)["VITE_API_URL"];
    vi.resetModules();
  });

  it("posts to Better Auth's verification endpoint", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    await sendVerificationEmail("jane@example.com");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8060/api/auth/send-verification-email",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ email: "jane@example.com" }),
      }),
    );
  });

  it("uses VITE_API_URL when posting to the verification endpoint", async () => {
    (import.meta.env as Record<string, unknown>)["VITE_API_URL"] =
      "https://api.gavelhouse.app";
    vi.resetModules();
    const { sendVerificationEmail: freshSendVerificationEmail } =
      await import("@/lib/auth");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    await freshSendVerificationEmail("jane@example.com");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.gavelhouse.app/api/auth/send-verification-email",
      expect.any(Object),
    );
  });

  it("throws when the resend endpoint fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
      }),
    );

    await expect(sendVerificationEmail("jane@example.com")).rejects.toThrow(
      "Too many requests",
    );
  });

  it("throws the response message when the resend endpoint returns message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "Try again later" }), {
        status: 400,
      }),
    );

    await expect(sendVerificationEmail("jane@example.com")).rejects.toThrow(
      "Try again later",
    );
  });

  it("throws an HTTP fallback when the resend error body is not JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not-json", { status: 502 }),
    );

    await expect(sendVerificationEmail("jane@example.com")).rejects.toThrow(
      "HTTP 502",
    );
  });

  it("throws an HTTP fallback when the resend error body has no message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({}), { status: 500 }),
    );

    await expect(sendVerificationEmail("jane@example.com")).rejects.toThrow(
      "HTTP 500",
    );
  });
});
