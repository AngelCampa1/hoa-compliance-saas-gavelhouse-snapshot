import { resolvePublicSignupCta } from "../lib/public-signup-cta";

interface PublicSignupCtaProps {
  sourcePage: string;
  buttonText?: string;
  ctaText?: string;
  ctaTarget?: string;
}

export default function PublicSignupCta({
  sourcePage,
  buttonText,
  ctaText,
  ctaTarget,
}: PublicSignupCtaProps) {
  const resolvedCta = resolvePublicSignupCta({
    sourcePage,
    explicitTarget: ctaTarget,
    explicitText: ctaText ?? buttonText,
  });

  return (
    <a
      href={resolvedCta.target}
      className="btn-primary btn-shimmer inline-flex items-center justify-center"
    >
      {resolvedCta.text}
    </a>
  );
}
