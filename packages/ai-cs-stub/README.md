# @ventora/ai-cs (stub)

The real `@ventora/ai-cs` is a private package published to an internal
registry. It ships the AI customer-support widget that `apps/app` mounts on the
authenticated dashboard.

It cannot be published with this repository, and it would not work here anyway:
the widget talks to a separately deployed Worker (`AI_CS_WORKER_ORIGIN`) that is
not part of this codebase and is no longer running.

This workspace package deliberately shadows the real package name so that
`pnpm install` resolves it locally and succeeds without registry credentials.
It exports a component with the same call signature that renders nothing.

The application code that uses it is unchanged and still worth reading:

- `apps/app/src/components/ai-cs-support-widget.tsx` — the mount point, and the
  comment explaining why the SPA passes `credentials: "include"` to a
  same-origin BFF instead of holding an HMAC signing secret.
- `apps/api/src/routes/aiCsProxy.ts` — the authenticated proxy that gates on the
  session and signs each forwarded request.
