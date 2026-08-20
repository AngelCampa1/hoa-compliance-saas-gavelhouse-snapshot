import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("governance transitions route source", () => {
  it("only renders pending acknowledge actions for the incoming board member", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/routes/_app.governance.transitions.tsx"),
      "utf8",
    );

    expect(source).toContain("authClient.useSession");
    expect(source).toContain("canAcknowledgeTransition");
    expect(source).toContain("t.toUserId === session?.user.id");
  });
});
