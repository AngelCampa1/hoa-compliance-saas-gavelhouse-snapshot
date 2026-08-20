import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import {
  signupInput,
  loginInput,
  inviteAcceptInput,
} from "../../src/schemas/auth.js";

describe("signupInput", () => {
  it("parses a valid signup payload", () => {
    const result = signupInput.parse({
      email: "user@example.com",
      password: "securepass1",
      name: "Jane Doe",
    });
    expect(result.email).toBe("user@example.com");
    expect(result.password).toBe("securepass1");
    expect(result.name).toBe("Jane Doe");
  });

  it("rejects invalid email", () => {
    expect(() =>
      signupInput.parse({
        email: "notanemail",
        password: "securepass1",
        name: "Jane",
      }),
    ).toThrow(ZodError);
  });

  it("rejects empty email", () => {
    expect(() =>
      signupInput.parse({ email: "", password: "securepass1", name: "Jane" }),
    ).toThrow(ZodError);
  });

  it("rejects password shorter than 8 chars", () => {
    expect(() =>
      signupInput.parse({
        email: "user@example.com",
        password: "short",
        name: "Jane",
      }),
    ).toThrow(ZodError);
  });

  it("rejects password longer than 128 chars", () => {
    expect(() =>
      signupInput.parse({
        email: "user@example.com",
        password: "a".repeat(129),
        name: "Jane",
      }),
    ).toThrow(ZodError);
  });

  it("accepts password of exactly 8 chars", () => {
    const result = signupInput.parse({
      email: "user@example.com",
      password: "12345678",
      name: "Jane",
    });
    expect(result.password).toBe("12345678");
  });

  it("accepts password of exactly 128 chars", () => {
    const result = signupInput.parse({
      email: "user@example.com",
      password: "a".repeat(128),
      name: "Jane",
    });
    expect(result.password.length).toBe(128);
  });

  it("rejects empty name", () => {
    expect(() =>
      signupInput.parse({
        email: "user@example.com",
        password: "securepass1",
        name: "",
      }),
    ).toThrow(ZodError);
  });

  it("rejects name longer than 128 chars", () => {
    expect(() =>
      signupInput.parse({
        email: "user@example.com",
        password: "securepass1",
        name: "a".repeat(129),
      }),
    ).toThrow(ZodError);
  });

  it("rejects missing fields", () => {
    expect(() => signupInput.parse({})).toThrow(ZodError);
  });

  it("accepts optional communityName field", () => {
    const result = signupInput.parse({
      email: "user@example.com",
      password: "securepass1",
      name: "Jane Doe",
      communityName: "Sunset HOA",
    });
    expect(result.communityName).toBe("Sunset HOA");
  });

  it("accepts optional state field as 2-letter uppercase code", () => {
    const result = signupInput.parse({
      email: "user@example.com",
      password: "securepass1",
      name: "Jane Doe",
      state: "TX",
    });
    expect(result.state).toBe("TX");
  });

  it("omits communityName and state when not provided", () => {
    const result = signupInput.parse({
      email: "user@example.com",
      password: "securepass1",
      name: "Jane Doe",
    });
    expect(result.communityName).toBeUndefined();
    expect(result.state).toBeUndefined();
  });

  it("rejects state that is not 2-letter uppercase", () => {
    expect(() =>
      signupInput.parse({
        email: "user@example.com",
        password: "securepass1",
        name: "Jane Doe",
        state: "texas",
      }),
    ).toThrow(ZodError);
  });

  it("rejects state that is only 1 letter", () => {
    expect(() =>
      signupInput.parse({
        email: "user@example.com",
        password: "securepass1",
        name: "Jane Doe",
        state: "T",
      }),
    ).toThrow(ZodError);
  });

  it("rejects communityName longer than 256 chars", () => {
    expect(() =>
      signupInput.parse({
        email: "user@example.com",
        password: "securepass1",
        name: "Jane Doe",
        communityName: "a".repeat(257),
      }),
    ).toThrow(ZodError);
  });
});

describe("loginInput", () => {
  it("parses a valid login payload", () => {
    const result = loginInput.parse({
      email: "user@example.com",
      password: "anypassword",
    });
    expect(result.email).toBe("user@example.com");
    expect(result.password).toBe("anypassword");
  });

  it("rejects invalid email", () => {
    expect(() =>
      loginInput.parse({ email: "bademail", password: "anypassword" }),
    ).toThrow(ZodError);
  });

  it("rejects missing email", () => {
    expect(() => loginInput.parse({ password: "anypassword" })).toThrow(
      ZodError,
    );
  });

  it("rejects empty password", () => {
    expect(() =>
      loginInput.parse({ email: "user@example.com", password: "" }),
    ).toThrow(ZodError);
  });

  it("accepts a single-char password (login only requires min 1)", () => {
    const result = loginInput.parse({
      email: "user@example.com",
      password: "x",
    });
    expect(result.password).toBe("x");
  });
});

describe("inviteAcceptInput", () => {
  it("parses a valid invite accept payload with only token", () => {
    const result = inviteAcceptInput.parse({ token: "abc123" });
    expect(result.token).toBe("abc123");
    expect(result.name).toBeUndefined();
    expect(result.password).toBeUndefined();
  });

  it("parses a valid invite accept payload with all fields", () => {
    const result = inviteAcceptInput.parse({
      token: "abc123",
      name: "John Smith",
      password: "newpass123",
    });
    expect(result.token).toBe("abc123");
    expect(result.name).toBe("John Smith");
    expect(result.password).toBe("newpass123");
  });

  it("rejects empty token", () => {
    expect(() => inviteAcceptInput.parse({ token: "" })).toThrow(ZodError);
  });

  it("rejects missing token", () => {
    expect(() => inviteAcceptInput.parse({ name: "Jane" })).toThrow(ZodError);
  });

  it("rejects name longer than 128 chars when provided", () => {
    expect(() =>
      inviteAcceptInput.parse({ token: "abc", name: "a".repeat(129) }),
    ).toThrow(ZodError);
  });

  it("rejects empty name when provided", () => {
    expect(() => inviteAcceptInput.parse({ token: "abc", name: "" })).toThrow(
      ZodError,
    );
  });

  it("rejects password shorter than 8 chars when provided", () => {
    expect(() =>
      inviteAcceptInput.parse({ token: "abc", password: "short" }),
    ).toThrow(ZodError);
  });

  it("rejects password longer than 128 chars when provided", () => {
    expect(() =>
      inviteAcceptInput.parse({ token: "abc", password: "a".repeat(129) }),
    ).toThrow(ZodError);
  });
});
