import { describe, it, expect } from "vitest";
import { resolveExitPopupProps } from "./exit-popup-props";
import type { SiteConfig } from "./types";

/** Minimal SiteConfig stub with only the fields resolveExitPopupProps reads. */
function makeConfig(
  overrides: Partial<{
    name: string;
    copy: SiteConfig["copy"];
  }> = {},
): SiteConfig {
  return {
    name: overrides.name ?? "TestSite",
    copy: overrides.copy,
  } as SiteConfig;
}

describe("resolveExitPopupProps", () => {
  it("returns all fields from config.copy.exitPopup", () => {
    const config = makeConfig({
      copy: {
        exitPopup: {
          headline: "Wait!",
          description: "Join us.",
          ctaText: "Sign Up",
          leftPanelLabel: "FREE",
          successSubMessage: "Check inbox.",
          declineText: "No thanks",
          privacyNote: "We'll send the requested resource.",
          errorInvalidEmail: "Bad email.",
          errorDuplicate: "Already signed up.",
          errorGeneric: "Error.",
          successMessage: "Done!",
        },
      },
    });

    const result = resolveExitPopupProps(config);

    expect(result).toEqual({
      headline: "Wait!",
      description: "Join us.",
      ctaText: "Sign Up",
      leftPanelLabel: "FREE",
      successSubMessage: "Check inbox.",
      declineText: "No thanks",
      privacyNote: "We'll send the requested resource.",
      errorInvalidEmail: "Bad email.",
      errorDuplicate: "Already signed up.",
      errorGeneric: "Error.",
      successMessage: "Done!",
    });
  });

  it("returns undefined for optional fields when not provided", () => {
    const config = makeConfig({
      copy: {
        exitPopup: {
          headline: "Wait!",
          description: "Join us.",
          ctaText: "Sign Up",
          leftPanelLabel: "FREE",
          successSubMessage: "Check inbox.",
        },
      },
    });

    const result = resolveExitPopupProps(config);

    expect(result.headline).toBe("Wait!");
    expect(result.declineText).toBeUndefined();
    expect(result.privacyNote).toBeUndefined();
    expect(result.errorInvalidEmail).toBeUndefined();
    expect(result.errorDuplicate).toBeUndefined();
    expect(result.errorGeneric).toBeUndefined();
    expect(result.successMessage).toBeUndefined();
  });

  it("throws when config.copy is undefined", () => {
    const config = makeConfig({ copy: undefined });

    expect(() => resolveExitPopupProps(config)).toThrow(
      "[TestSite] config.copy.exitPopup is required",
    );
  });

  it("throws when config.copy.exitPopup is undefined", () => {
    const config = makeConfig({ copy: {} });

    expect(() => resolveExitPopupProps(config)).toThrow(
      "[TestSite] config.copy.exitPopup is required",
    );
  });

  it("includes the site name in the error message", () => {
    const config = makeConfig({ name: "MySaaS", copy: undefined });

    expect(() => resolveExitPopupProps(config)).toThrow("[MySaaS]");
  });

  it("passes through loadingText when provided", () => {
    const config = makeConfig({
      copy: {
        exitPopup: {
          headline: "Wait!",
          description: "Join us.",
          ctaText: "Sign Up",
          leftPanelLabel: "FREE",
          successSubMessage: "Check inbox.",
          loadingText: "Joining...",
        },
      },
    });

    const result = resolveExitPopupProps(config);

    expect(result.loadingText).toBe("Joining...");
  });

  it("passes through showLeadMagnetContent when provided", () => {
    const config = makeConfig({
      copy: {
        exitPopup: {
          headline: "Wait!",
          description: "Join us.",
          ctaText: "Sign Up",
          leftPanelLabel: "FREE",
          successSubMessage: "Check inbox.",
          showLeadMagnetContent: false,
        },
      },
    });

    const result = resolveExitPopupProps(config);

    expect(result.showLeadMagnetContent).toBe(false);
  });

  it("leaves loadingText undefined when not provided", () => {
    const config = makeConfig({
      copy: {
        exitPopup: {
          headline: "Wait!",
          description: "Join us.",
          ctaText: "Sign Up",
          leftPanelLabel: "FREE",
          successSubMessage: "Check inbox.",
        },
      },
    });

    const result = resolveExitPopupProps(config);

    expect(result.loadingText).toBeUndefined();
  });
});
