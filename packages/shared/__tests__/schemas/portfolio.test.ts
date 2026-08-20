import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import {
  PortfolioCreateInput,
  PortfolioLinkInput,
} from "../../src/schemas/portfolio.js";

describe("PortfolioCreateInput", () => {
  it("parses a valid name", () => {
    const result = PortfolioCreateInput.parse({ name: "Sunridge Properties" });
    expect(result.name).toBe("Sunridge Properties");
  });

  it("rejects an empty name", () => {
    expect(() => PortfolioCreateInput.parse({ name: "" })).toThrow(ZodError);
  });

  it("rejects a name exceeding 120 characters", () => {
    const longName = "a".repeat(121);
    expect(() => PortfolioCreateInput.parse({ name: longName })).toThrow(
      ZodError,
    );
  });

  it("accepts a name exactly 120 characters long", () => {
    const maxName = "a".repeat(120);
    expect(() => PortfolioCreateInput.parse({ name: maxName })).not.toThrow();
  });

  it("accepts a name of 1 character", () => {
    expect(() => PortfolioCreateInput.parse({ name: "A" })).not.toThrow();
  });

  it("rejects missing name field", () => {
    expect(() => PortfolioCreateInput.parse({})).toThrow(ZodError);
  });
});

describe("PortfolioLinkInput", () => {
  it("parses a valid link input", () => {
    const result = PortfolioLinkInput.parse({
      portfolioId: "port-1",
      communityId: "comm-1",
    });
    expect(result.portfolioId).toBe("port-1");
    expect(result.communityId).toBe("comm-1");
  });

  it("rejects missing portfolioId", () => {
    expect(() => PortfolioLinkInput.parse({ communityId: "comm-1" })).toThrow(
      ZodError,
    );
  });

  it("rejects missing communityId", () => {
    expect(() => PortfolioLinkInput.parse({ portfolioId: "port-1" })).toThrow(
      ZodError,
    );
  });

  it("rejects empty portfolioId", () => {
    expect(() =>
      PortfolioLinkInput.parse({ portfolioId: "", communityId: "comm-1" }),
    ).toThrow(ZodError);
  });
  it("rejects empty communityId", () => {
    expect(() =>
      PortfolioLinkInput.parse({ portfolioId: "port-1", communityId: "" }),
    ).toThrow(ZodError);
  });
});
