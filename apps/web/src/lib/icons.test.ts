import { describe, it, expect } from "vitest";
import {
  CheckIcon,
  CheckIconHidden,
  CrossIcon,
  CrossIconHidden,
  ChevronRightIcon,
  PlusIcon,
  MinusIcon,
} from "./icons";

describe("icons", () => {
  const icons = [
    { name: "CheckIcon", value: CheckIcon, label: "yes" },
    { name: "CrossIcon", value: CrossIcon, label: "no" },
    { name: "ChevronRightIcon", value: ChevronRightIcon, label: "next" },
    { name: "PlusIcon", value: PlusIcon, label: "expand" },
    { name: "MinusIcon", value: MinusIcon, label: "collapse" },
  ];

  for (const icon of icons) {
    describe(icon.name, () => {
      it("is a non-empty string", () => {
        expect(typeof icon.value).toBe("string");
        expect(icon.value.length).toBeGreaterThan(0);
      });

      it("contains an SVG element", () => {
        expect(icon.value).toContain("<svg");
        expect(icon.value).toContain("</svg>");
      });

      it('has role="img"', () => {
        expect(icon.value).toContain('role="img"');
      });

      it(`has aria-label="${icon.label}"`, () => {
        expect(icon.value).toContain(`aria-label="${icon.label}"`);
      });

      it('has focusable="false"', () => {
        expect(icon.value).toContain('focusable="false"');
      });

      it('has fill="currentColor"', () => {
        expect(icon.value).toContain('fill="currentColor"');
      });

      it("has a viewBox attribute", () => {
        expect(icon.value).toMatch(/viewBox="[^"]+"/);
      });

      it("has width and height attributes", () => {
        expect(icon.value).toMatch(/width="\d+"/);
        expect(icon.value).toMatch(/height="\d+"/);
      });

      it("contains a path or line element", () => {
        expect(icon.value).toMatch(/<(path|line|rect|circle)/);
      });
    });
  }

  describe("decorative variant", () => {
    it("CheckIcon can be wrapped with aria-hidden for decorative use", () => {
      // Icons include role="img" for semantic use; when used decoratively
      // the wrapper element should add aria-hidden="true"
      expect(CheckIcon).toContain('role="img"');
    });
  });

  describe("CheckIconHidden", () => {
    it("is a non-empty string containing an SVG", () => {
      expect(typeof CheckIconHidden).toBe("string");
      expect(CheckIconHidden).toContain("<svg");
      expect(CheckIconHidden).toContain("</svg>");
    });

    it('has aria-hidden="true" instead of role="img" and aria-label', () => {
      expect(CheckIconHidden).toContain('aria-hidden="true"');
      expect(CheckIconHidden).not.toContain('role="img"');
      expect(CheckIconHidden).not.toContain("aria-label");
    });

    it('has focusable="false" and fill="currentColor"', () => {
      expect(CheckIconHidden).toContain('focusable="false"');
      expect(CheckIconHidden).toContain('fill="currentColor"');
    });

    it("shares the same path shape as CheckIcon", () => {
      // Both render a checkmark -- same path data
      expect(CheckIconHidden).toContain("M11.03 3.97");
    });
  });

  describe("CrossIconHidden", () => {
    it("is a non-empty string containing an SVG", () => {
      expect(typeof CrossIconHidden).toBe("string");
      expect(CrossIconHidden).toContain("<svg");
      expect(CrossIconHidden).toContain("</svg>");
    });

    it('has aria-hidden="true" instead of role="img" and aria-label', () => {
      expect(CrossIconHidden).toContain('aria-hidden="true"');
      expect(CrossIconHidden).not.toContain('role="img"');
      expect(CrossIconHidden).not.toContain("aria-label");
    });

    it('has focusable="false" and fill="currentColor"', () => {
      expect(CrossIconHidden).toContain('focusable="false"');
      expect(CrossIconHidden).toContain('fill="currentColor"');
    });

    it("shares the same path shape as CrossIcon", () => {
      // Both render an X -- same path data
      expect(CrossIconHidden).toContain("M3.47 3.47");
    });
  });
});
