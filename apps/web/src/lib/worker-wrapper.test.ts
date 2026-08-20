import { describe, expect, it, vi } from "vitest";
import { createGavelhouseWorker } from "./worker-wrapper";

describe("createGavelhouseWorker", () => {
  it("redirects www requests to the apex host while preserving path and query", async () => {
    const astroWorker = {
      fetch: vi.fn(() => new Response("ok")),
    };
    const worker = createGavelhouseWorker(astroWorker);

    const response = await worker.fetch(
      new Request("https://www.gavelhouse.app/pricing/?plan=annual"),
      {},
      {},
    );

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(
      "https://gavelhouse.app/pricing/?plan=annual",
    );
    expect(astroWorker.fetch).not.toHaveBeenCalled();
  });

  it("canonicalizes the host and trailing slash in one redirect", async () => {
    const astroWorker = {
      fetch: vi.fn(() => new Response("ok")),
    };
    const worker = createGavelhouseWorker(astroWorker);

    const response = await worker.fetch(
      new Request("https://www.gavelhouse.app/pricing?plan=annual"),
      {},
      {},
    );

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(
      "https://gavelhouse.app/pricing/?plan=annual",
    );
    expect(astroWorker.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["https://boardstack.app/pricing/?plan=annual"],
    ["https://www.boardstack.app/pricing/?plan=annual"],
    ["https://boardstack.app/pricing?plan=annual"],
  ])(
    "301-redirects the retired boardstack.app domain (%s) to gavelhouse.app",
    async (input) => {
      const astroWorker = { fetch: vi.fn(() => new Response("ok")) };
      const worker = createGavelhouseWorker(astroWorker);

      const response = await worker.fetch(new Request(input), {}, {});

      expect(response.status).toBe(301);
      expect(response.headers.get("location")).toBe(
        "https://gavelhouse.app/pricing/?plan=annual",
      );
      expect(astroWorker.fetch).not.toHaveBeenCalled();
    },
  );

  it("delegates non-www requests to the Astro worker unchanged", async () => {
    const request = new Request("https://gavelhouse.app/pricing/");
    const env = { PRODUCT_NAME: "Gavelhouse" };
    const context = {};
    const astroResponse = new Response("astro");
    const astroWorker = {
      fetch: vi.fn(() => astroResponse),
    };
    const worker = createGavelhouseWorker(astroWorker);

    const response = await worker.fetch(request, env, context);

    expect(response).toBe(astroResponse);
    expect(astroWorker.fetch).toHaveBeenCalledWith(request, env, context);
  });

  it("returns a 410 shutdown page when shutdown mode is enabled", async () => {
    const astroWorker = { fetch: vi.fn(() => new Response("astro")) };
    const worker = createGavelhouseWorker(astroWorker);

    const response = await worker.fetch(
      new Request("https://gavelhouse.app/pricing/"),
      { GAVELHOUSE_SHUTDOWN: "true", BUILD_COMMIT: "abc1234" },
      {},
    );

    expect(response.status).toBe(410);
    expect(response.headers.get("X-Gavelhouse-Shutdown")).toBe("true");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    const html = await response.text();
    expect(html).toContain("Gavelhouse is closed");
    expect(html).toContain('<meta name="build-commit" content="abc1234">');
    expect(astroWorker.fetch).not.toHaveBeenCalled();
  });

  it("redirects extensionless non-canonical paths to trailing-slash URLs", async () => {
    const astroWorker = { fetch: vi.fn(() => new Response("ok")) };
    const worker = createGavelhouseWorker(astroWorker);

    const response = await worker.fetch(
      new Request("https://gavelhouse.app/pricing?plan=annual"),
      {},
      {},
    );

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(
      "https://gavelhouse.app/pricing/?plan=annual",
    );
    expect(astroWorker.fetch).not.toHaveBeenCalled();
  });

  it("does not redirect file or API paths to trailing-slash URLs", async () => {
    const astroResponse = new Response("astro");
    const astroWorker = { fetch: vi.fn(() => astroResponse) };
    const worker = createGavelhouseWorker(astroWorker);

    expect(
      await worker.fetch(
        new Request("https://gavelhouse.app/llms.txt"),
        {},
        {},
      ),
    ).toBe(astroResponse);
    expect(
      await worker.fetch(
        new Request("https://gavelhouse.app/api/status"),
        {},
        {},
      ),
    ).toBe(astroResponse);
  });

  it("sets one cache-control value for sitemap responses", async () => {
    const astroWorker = {
      fetch: vi.fn(
        () =>
          new Response("sitemap", {
            headers: {
              "Cache-Control":
                "public, max-age=300, stale-while-revalidate=3600, public, max-age=86400",
            },
          }),
      ),
    };
    const worker = createGavelhouseWorker(astroWorker);

    const response = await worker.fetch(
      new Request("https://gavelhouse.app/sitemap-index.xml"),
      {},
      {},
    );

    expect(await response.text()).toBe("sitemap");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=86400");
  });

  it("intercepts the AI-SDR context route instead of delegating to Astro", async () => {
    const astroWorker = { fetch: vi.fn(() => new Response("astro")) };
    const worker = createGavelhouseWorker(astroWorker);

    const response = await worker.fetch(
      new Request(
        "https://gavelhouse.app/api/ai-sdr/context?productId=gavelhouse",
      ),
      {},
      {},
    );

    // No context secret in this env -> 503 straight from the context handler.
    expect(response.status).toBe(503);
    expect(astroWorker.fetch).not.toHaveBeenCalled();
  });

  it("intercepts the AI-SDR proxy route instead of delegating to Astro", async () => {
    const astroWorker = { fetch: vi.fn(() => new Response("astro")) };
    const worker = createGavelhouseWorker(astroWorker);

    const response = await worker.fetch(
      new Request("https://gavelhouse.app/api/ai-sdr/v1/sessions", {
        method: "POST",
        headers: { Origin: "https://gavelhouse.app" },
        body: JSON.stringify({ productId: "gavelhouse" }),
      }),
      {},
      {},
    );

    // No worker URL/secret in this env -> 503 from the proxy handler.
    expect(response.status).toBe(503);
    expect(astroWorker.fetch).not.toHaveBeenCalled();
  });

  it("delegates AI-SDR-shaped paths that do not route (wrong method) to Astro", async () => {
    const astroResponse = new Response("astro");
    const astroWorker = { fetch: vi.fn(() => astroResponse) };
    const worker = createGavelhouseWorker(astroWorker);

    const response = await worker.fetch(
      new Request("https://gavelhouse.app/api/ai-sdr/context", {
        method: "POST",
      }),
      {},
      {},
    );

    expect(response).toBe(astroResponse);
    expect(astroWorker.fetch).toHaveBeenCalled();
  });
});
