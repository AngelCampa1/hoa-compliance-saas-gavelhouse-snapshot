import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";
import { createAppQueryClient } from "@/lib/query-client";
import { initSentry } from "@/lib/sentry";
import { initDashboardAnalytics } from "@/lib/analytics";
import "./index.css";

/**
 * Gavelhouse was wound down in June 2026. Production builds set
 * VITE_GAVELHOUSE_SHUTDOWN=true so the deployed bundle renders nothing but the
 * notice below. Local development leaves the flag unset, which boots the real
 * dashboard against a local API — see docs/local-development.md.
 */
function ShutdownApp() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-16">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">
          Gavelhouse
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-normal sm:text-5xl">
          Gavelhouse is closed
        </h1>
        <p className="mt-5 text-base leading-7 text-slate-600">
          The app is no longer open.
        </p>
      </section>
    </main>
  );
}

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

if (import.meta.env["VITE_GAVELHOUSE_SHUTDOWN"] === "true") {
  createRoot(rootEl).render(
    <StrictMode>
      <ShutdownApp />
    </StrictMode>,
  );
} else {
  initSentry();
  initDashboardAnalytics();

  const queryClient = createAppQueryClient();

  createRoot(rootEl).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
}
