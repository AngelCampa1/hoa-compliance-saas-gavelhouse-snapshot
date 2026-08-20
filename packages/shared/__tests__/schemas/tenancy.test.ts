import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import {
  CommunityRole,
  createCommunityInput,
  communitySetupInput,
  inviteMemberInput,
} from "../../src/schemas/tenancy.js";

describe("CommunityRole", () => {
  it("accepts all valid roles", () => {
    const roles = [
      "owner",
      "admin",
      "treasurer",
      "secretary",
      "viewer",
    ] as const;
    for (const role of roles) {
      expect(CommunityRole.parse(role)).toBe(role);
    }
  });

  it("rejects an invalid role", () => {
    expect(() => CommunityRole.parse("superadmin")).toThrow(ZodError);
  });

  it("rejects an empty string", () => {
    expect(() => CommunityRole.parse("")).toThrow(ZodError);
  });
});

describe("createCommunityInput", () => {
  it("parses a valid community creation payload", () => {
    const result = createCommunityInput.parse({
      name: "Sunset Ridge HOA",
      slug: "sunset-ridge",
      state: "CA",
    });
    expect(result.name).toBe("Sunset Ridge HOA");
    expect(result.slug).toBe("sunset-ridge");
    expect(result.state).toBe("CA");
  });

  it("rejects empty name", () => {
    expect(() =>
      createCommunityInput.parse({
        name: "",
        slug: "sunset-ridge",
        state: "CA",
      }),
    ).toThrow(ZodError);
  });

  it("rejects name longer than 256 chars", () => {
    expect(() =>
      createCommunityInput.parse({
        name: "a".repeat(257),
        slug: "sunset-ridge",
        state: "CA",
      }),
    ).toThrow(ZodError);
  });

  it("accepts name of exactly 256 chars", () => {
    const result = createCommunityInput.parse({
      name: "a".repeat(256),
      slug: "valid-slug",
      state: "TX",
    });
    expect(result.name.length).toBe(256);
  });

  it("rejects empty slug", () => {
    expect(() =>
      createCommunityInput.parse({ name: "HOA", slug: "", state: "CA" }),
    ).toThrow(ZodError);
  });

  it("rejects slug longer than 64 chars", () => {
    expect(() =>
      createCommunityInput.parse({
        name: "HOA",
        slug: "a".repeat(65),
        state: "CA",
      }),
    ).toThrow(ZodError);
  });

  it("rejects slug with uppercase letters", () => {
    expect(() =>
      createCommunityInput.parse({
        name: "HOA",
        slug: "Sunset-Ridge",
        state: "CA",
      }),
    ).toThrow(ZodError);
  });

  it("rejects slug with spaces", () => {
    expect(() =>
      createCommunityInput.parse({
        name: "HOA",
        slug: "sunset ridge",
        state: "CA",
      }),
    ).toThrow(ZodError);
  });

  it("rejects slug with special chars other than hyphen", () => {
    expect(() =>
      createCommunityInput.parse({
        name: "HOA",
        slug: "sunset_ridge",
        state: "CA",
      }),
    ).toThrow(ZodError);
  });

  it("accepts slug with numbers", () => {
    const result = createCommunityInput.parse({
      name: "HOA",
      slug: "sunset-ridge-2",
      state: "CA",
    });
    expect(result.slug).toBe("sunset-ridge-2");
  });

  it("rejects state that is not 2 chars", () => {
    expect(() =>
      createCommunityInput.parse({ name: "HOA", slug: "sunset", state: "CAL" }),
    ).toThrow(ZodError);
  });

  it("rejects state that is 1 char", () => {
    expect(() =>
      createCommunityInput.parse({ name: "HOA", slug: "sunset", state: "C" }),
    ).toThrow(ZodError);
  });

  it("rejects empty state", () => {
    expect(() =>
      createCommunityInput.parse({ name: "HOA", slug: "sunset", state: "" }),
    ).toThrow(ZodError);
  });

  it("rejects lowercase state code", () => {
    expect(() =>
      createCommunityInput.parse({ name: "HOA", slug: "sunset", state: "ca" }),
    ).toThrow(ZodError);
  });
});

describe("communitySetupInput", () => {
  it("parses payload with both name and state", () => {
    const result = communitySetupInput.parse({
      communityId: "community-1",
      name: "Sunset HOA",
      state: "TX",
    });
    expect(result.communityId).toBe("community-1");
    expect(result.name).toBe("Sunset HOA");
    expect(result.state).toBe("TX");
  });

  it("parses payload with only name", () => {
    const result = communitySetupInput.parse({ name: "Sunset HOA" });
    expect(result.name).toBe("Sunset HOA");
    expect(result.state).toBeUndefined();
  });

  it("parses payload with only state", () => {
    const result = communitySetupInput.parse({ state: "FL" });
    expect(result.state).toBe("FL");
    expect(result.name).toBeUndefined();
  });

  it("parses an empty object (all optional)", () => {
    const result = communitySetupInput.parse({});
    expect(result.communityId).toBeUndefined();
    expect(result.name).toBeUndefined();
    expect(result.state).toBeUndefined();
  });

  it("rejects an empty communityId", () => {
    expect(() => communitySetupInput.parse({ communityId: "" })).toThrow(
      ZodError,
    );
  });

  it("rejects lowercase state code", () => {
    expect(() => communitySetupInput.parse({ state: "tx" })).toThrow(ZodError);
  });

  it("rejects state longer than 2 chars", () => {
    expect(() => communitySetupInput.parse({ state: "TEX" })).toThrow(ZodError);
  });

  it("rejects empty name", () => {
    expect(() => communitySetupInput.parse({ name: "" })).toThrow(ZodError);
  });

  it("rejects name longer than 256 chars", () => {
    expect(() => communitySetupInput.parse({ name: "a".repeat(257) })).toThrow(
      ZodError,
    );
  });
});

describe("inviteMemberInput", () => {
  it("parses a valid invite with admin role", () => {
    const result = inviteMemberInput.parse({
      email: "board@example.com",
      role: "admin",
    });
    expect(result.email).toBe("board@example.com");
    expect(result.role).toBe("admin");
  });

  it("parses all non-owner roles", () => {
    const roles = ["admin", "treasurer", "secretary", "viewer"] as const;
    for (const role of roles) {
      const result = inviteMemberInput.parse({
        email: "member@example.com",
        role,
      });
      expect(result.role).toBe(role);
    }
  });

  it("rejects the owner role in invites", () => {
    expect(() =>
      inviteMemberInput.parse({ email: "owner@example.com", role: "owner" }),
    ).toThrow(ZodError);
  });

  it("rejects invalid email", () => {
    expect(() =>
      inviteMemberInput.parse({ email: "bademail", role: "admin" }),
    ).toThrow(ZodError);
  });

  it("rejects invalid role", () => {
    expect(() =>
      inviteMemberInput.parse({
        email: "user@example.com",
        role: "superadmin",
      }),
    ).toThrow(ZodError);
  });

  it("rejects missing email", () => {
    expect(() => inviteMemberInput.parse({ role: "admin" })).toThrow(ZodError);
  });
});
