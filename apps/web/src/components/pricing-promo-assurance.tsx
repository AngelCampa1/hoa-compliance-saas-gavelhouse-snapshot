export interface PricingPromoAssuranceProps {
  promoCode: string;
  promoText: string;
  guaranteeText: string;
}

export function PricingPromoAssurance({
  promoCode,
  promoText,
  guaranteeText,
}: PricingPromoAssuranceProps) {
  return (
    <div
      className="mx-auto mb-6 grid max-w-3xl gap-3 rounded-md border border-[var(--color-accent-300)] bg-[var(--surface-secondary)] p-4 text-[var(--color-brand-text)] md:grid-cols-[auto_1fr]"
      data-pricing-promo-assurance
    >
      <span className="inline-flex w-fit items-center rounded-full bg-[var(--color-accent-500)] px-3 py-1 text-[length:var(--text-caption)] font-semibold text-[var(--color-accent-950)]">
        {promoCode}
      </span>
      <div className="space-y-1 text-[length:var(--text-caption)] leading-6">
        <p className="font-medium">{promoText}</p>
        <p className="text-[var(--color-brand-muted)]">{guaranteeText}</p>
      </div>
    </div>
  );
}
