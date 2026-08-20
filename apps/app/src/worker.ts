function shutdownHtml(buildCommit = "dev") {
  return `<!doctype html>
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
    <p>The app is no longer open.</p>
  </main>
</body>
</html>`;
}

type AppWorkerEnv = {
  ASSETS?: { fetch(request: Request): Promise<Response> };
  BUILD_COMMIT?: string;
};

export function appShutdownResponse(env?: AppWorkerEnv) {
  return new Response(shutdownHtml(env?.BUILD_COMMIT), {
    status: 410,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Gavelhouse-Shutdown": "true",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export default {
  fetch(_request: Request, env: AppWorkerEnv) {
    return appShutdownResponse(env);
  },
};
