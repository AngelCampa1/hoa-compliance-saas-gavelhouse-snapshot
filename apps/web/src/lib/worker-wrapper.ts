import { routeAiSdr } from "./ai-sdr/handlers";

type AstroWorker = {
  fetch(
    request: Request,
    env: unknown,
    context: unknown,
  ): Response | Promise<Response>;
};

type ShutdownEnv = {
  GAVELHOUSE_SHUTDOWN?: string;
  BUILD_COMMIT?: string;
};

function isShutdown(env: unknown): env is ShutdownEnv {
  return (
    typeof env === "object" &&
    env !== null &&
    (env as ShutdownEnv).GAVELHOUSE_SHUTDOWN === "true"
  );
}

function shutdownResponse(buildCommit = "dev") {
  return new Response(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="build-commit" content="${buildCommit}">
  <title>Gavelhouse is closed</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #f8fafc;
      color: #0f172a;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
    }
    main {
      width: min(100% - 48px, 560px);
    }
    p {
      color: #475569;
      font-size: 1rem;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <main>
    <h1>Gavelhouse is closed</h1>
    <p>The site and app are no longer open.</p>
  </main>
</body>
</html>`,
    {
      status: 410,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Gavelhouse-Shutdown": "true",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}

function shouldRedirectToTrailingSlash(url: URL): boolean {
  if (url.pathname === "/" || url.pathname.endsWith("/")) return false;
  if (url.pathname.startsWith("/api/")) return false;
  return !/\/[^/]+\.[^/]+$/.test(url.pathname);
}

export function createGavelhouseWorker(astroWorker: AstroWorker) {
  return {
    fetch(request: Request, env: unknown, context: unknown) {
      const url = new URL(request.url);

      // Canonicalize to the apex gavelhouse.app host. The retired boardstack.app
      // domain is redirected here (never served), so it stays a 301 redirect and
      // never mirrors the marketing site.
      if (
        url.hostname === "www.gavelhouse.app" ||
        url.hostname === "boardstack.app" ||
        url.hostname === "www.boardstack.app"
      ) {
        url.hostname = "gavelhouse.app";
        url.protocol = "https:";
        if (shouldRedirectToTrailingSlash(url)) {
          url.pathname = `${url.pathname}/`;
        }
        return Response.redirect(url.toString(), 301);
      }

      if (isShutdown(env)) {
        return shutdownResponse(env.BUILD_COMMIT);
      }

      if (shouldRedirectToTrailingSlash(url)) {
        url.pathname = `${url.pathname}/`;
        return Response.redirect(url.toString(), 301);
      }

      if (
        url.pathname === "/sitemap-index.xml" ||
        /^\/sitemap-\d+\.xml$/.test(url.pathname)
      ) {
        return Promise.resolve(astroWorker.fetch(request, env, context)).then(
          (response) => {
            const headers = new Headers(response.headers);
            headers.set("Cache-Control", "public, max-age=86400");
            return new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers,
            });
          },
        );
      }

      // Intercept the same-origin AI-SDR BFF + context routes before delegating
      // to Astro. The wrapper always runs first (run_worker_first=true), so
      // these resolve regardless of whether Astro emits on-demand routes.
      const aiSdrResponse = routeAiSdr(request, env);
      if (aiSdrResponse) return aiSdrResponse;

      return astroWorker.fetch(request, env, context);
    },
  };
}
