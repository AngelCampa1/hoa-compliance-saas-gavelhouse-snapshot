import type { SiteConfig, ExitPopupCopy } from "./types";

interface ResolvedExitPopupProps {
  headline: string;
  description: string;
  ctaText: string;
  leftPanelLabel: string;
  successSubMessage: string;
  showLeadMagnetContent?: boolean;
  declineText: string | undefined;
  privacyNote: string | undefined;
  errorInvalidEmail: string | undefined;
  errorDuplicate: string | undefined;
  errorGeneric: string | undefined;
  successMessage: string | undefined;
  loadingText?: string;
}

/**
 * Resolves all exit-popup props from a SiteConfig.
 * Requires that `config.copy.exitPopup` has all mandatory fields populated.
 * Layouts call this instead of passing optional-chain expressions.
 */
export function resolveExitPopupProps(
  config: SiteConfig,
): ResolvedExitPopupProps {
  const copy: ExitPopupCopy | undefined = config.copy?.exitPopup;

  if (!copy) {
    throw new Error(
      `[${config.name}] config.copy.exitPopup is required when exitPopup is enabled. ` +
        `Provide headline, description, ctaText, leftPanelLabel, and successSubMessage.`,
    );
  }

  return {
    headline: copy.headline,
    description: copy.description,
    ctaText: copy.ctaText,
    leftPanelLabel: copy.leftPanelLabel,
    successSubMessage: copy.successSubMessage,
    showLeadMagnetContent: copy.showLeadMagnetContent,
    declineText: copy.declineText,
    privacyNote: copy.privacyNote,
    errorInvalidEmail: copy.errorInvalidEmail,
    errorDuplicate: copy.errorDuplicate,
    errorGeneric: copy.errorGeneric,
    successMessage: copy.successMessage,
    ...(copy.loadingText !== undefined && { loadingText: copy.loadingText }),
  };
}
