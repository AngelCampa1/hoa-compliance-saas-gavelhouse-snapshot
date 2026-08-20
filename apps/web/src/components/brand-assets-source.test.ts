import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const publicDir = resolve(__dirname, "../../public");

function readPublicAsset(fileName: string): string {
  return readFileSync(resolve(publicDir, fileName), "utf8");
}

describe("Gavelhouse public brand assets", () => {
  it("ships the selected navy and gold wordmark in the light logo", () => {
    const source = readPublicAsset("logo-light.svg");

    expect(source).toContain("#163a5f");
    expect(source).toContain("#cb8a2e");
    expect(source).toContain(">Gavel<");
    expect(source).toContain(">house<");
    expect(source).toContain('letter-spacing="0"');
    expect(source).not.toContain('letter-spacing="-');
  });

  it("does not keep the old teal/orange Gavelhouse palette in source fixtures", () => {
    const stylesheet = readFileSync(
      resolve(__dirname, "../styles/global.css"),
      "utf8",
    );
    const contrastTest = readFileSync(
      resolve(__dirname, "../lib/contrast.test.ts"),
      "utf8",
    );

    expect(stylesheet).not.toContain("#0d9488");
    expect(contrastTest).not.toContain(
      'name: "gavelhouse", primary: "#0d9488"',
    );
    expect(contrastTest).not.toContain(
      'name: "gavelhouse", primary: "#0d9488", accent: "#f59e0b"',
    );
  });

  it("ships a stacked-check favicon using the selected logo mark", () => {
    const source = readPublicAsset("favicon.svg");

    expect(source).toContain("#163a5f");
    expect(source).toContain("#cb8a2e");
    expect(source).toContain("brand-logo-mark");
  });
});
