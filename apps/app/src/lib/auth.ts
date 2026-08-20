import { createAuthClient } from "better-auth/react";
import { api, type AuthProviders } from "@/lib/api";

function getAuthBase(): string {
  return (
    (import.meta.env["VITE_API_URL"] as string | undefined) ??
    "http://localhost:8060"
  );
}

export const authClient = createAuthClient({
  baseURL: getAuthBase(),
});

export type Session = typeof authClient.$Infer.Session;

export async function getAuthProviders(): Promise<AuthProviders> {
  return api.auth.providers();
}

export async function sendVerificationEmail(email: string): Promise<void> {
  const res = await fetch(`${getAuthBase()}/api/auth/send-verification-email`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  if (!res.ok) {
    const body = (await res
      .json()
      .catch(() => ({ error: `HTTP ${res.status}` }))) as {
      error?: string;
      message?: string;
    };
    throw new Error(body.error ?? body.message ?? `HTTP ${res.status}`);
  }
}
