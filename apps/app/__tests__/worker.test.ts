import { describe, expect, it } from "vitest";
import appWorker, { appShutdownResponse } from "../src/worker";

describe("app shutdown worker", () => {
  it("returns a 410 shutdown page", async () => {
    const response = await appWorker.fetch(
      new Request("https://my.gavelhouse.app/dashboard"),
      { BUILD_COMMIT: "abc1234" },
    );

    expect(response.status).toBe(410);
    expect(response.headers.get("Content-Type")).toBe(
      "text/html; charset=utf-8",
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Gavelhouse-Shutdown")).toBe("true");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    const html = await response.text();
    expect(html).toContain("Gavelhouse is closed");
    expect(html).toContain('<meta name="build-commit" content="abc1234">');
  });

  it("uses noindex metadata", async () => {
    const html = await appShutdownResponse().text();

    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(html).toContain('<meta name="build-commit" content="dev">');
  });
});
