import { describe, it, expect } from "vitest";
import { postEntryBlockReason } from "@/lib/journal-entry";

const ready = {
  entryDate: "2026-06-07",
  memo: "Transfer to reserve",
  hasPostableLine: true,
  entryBalanced: true,
};

describe("postEntryBlockReason", () => {
  it("returns null when the entry is ready to post", () => {
    expect(postEntryBlockReason(ready)).toBeNull();
  });

  it("asks for a date first when the date is missing", () => {
    expect(postEntryBlockReason({ ...ready, entryDate: "" })).toBe(
      "Add an entry date to post.",
    );
  });

  it("asks for a memo when it is empty", () => {
    expect(postEntryBlockReason({ ...ready, memo: "" })).toBe(
      "Add a memo so others know what this entry is for.",
    );
  });

  it("treats a whitespace-only memo as missing", () => {
    expect(postEntryBlockReason({ ...ready, memo: "   " })).toBe(
      "Add a memo so others know what this entry is for.",
    );
  });

  it("asks for a posting line when none has an account and amount", () => {
    expect(postEntryBlockReason({ ...ready, hasPostableLine: false })).toBe(
      "Add at least one line with an account and an amount.",
    );
  });

  it("asks to balance when debits and credits differ", () => {
    expect(postEntryBlockReason({ ...ready, entryBalanced: false })).toBe(
      "Make the debits and credits equal before posting.",
    );
  });

  it("guides the form top-to-bottom: date before memo", () => {
    expect(postEntryBlockReason({ ...ready, entryDate: "", memo: "" })).toBe(
      "Add an entry date to post.",
    );
  });

  it("guides the form top-to-bottom: memo before lines", () => {
    expect(
      postEntryBlockReason({ ...ready, memo: "", hasPostableLine: false }),
    ).toBe("Add a memo so others know what this entry is for.");
  });

  it("guides the form top-to-bottom: lines before balance", () => {
    expect(
      postEntryBlockReason({
        ...ready,
        hasPostableLine: false,
        entryBalanced: false,
      }),
    ).toBe("Add at least one line with an account and an amount.");
  });
});
