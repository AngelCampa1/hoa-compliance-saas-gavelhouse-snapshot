import * as React from "react";
import { BaseLayout } from "./BaseLayout.js";

export type TrialEndingProps = {
  recipientName: string | null | undefined;
  communityName: string;
  planName: string;
  amountLabel: string;
  trialStartedLabel: string;
  trialEndsLabel: string;
  billingConfigured: boolean;
  ctaUrl: string;
  companyPostalAddress: string;
};

const buttonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "14px 28px",
  backgroundColor: "#0f172a",
  color: "#ffffff",
  textDecoration: "none",
  borderRadius: "6px",
  fontSize: "16px",
  fontWeight: 600,
};

const paragraphStyle: React.CSSProperties = {
  margin: "0 0 16px 0",
  fontSize: "16px",
  lineHeight: "24px",
  color: "#1f2937",
};

function greeting(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed ? `Hi ${trimmed},` : "Hi,";
}

export function TrialEnding({
  recipientName,
  communityName,
  planName,
  amountLabel,
  trialStartedLabel,
  trialEndsLabel,
  billingConfigured,
  ctaUrl,
  companyPostalAddress,
}: TrialEndingProps): React.ReactElement {
  const actionLine = billingConfigured
    ? `On ${trialEndsLabel}, we will automatically charge ${amountLabel} for your ${planName} plan unless you cancel before then.`
    : `If you do not add billing by ${trialEndsLabel}, Gavelhouse will lock access until you start a paid subscription.`;

  const ctaLabel = billingConfigured ? "Manage billing" : "Add payment method";

  return (
    <BaseLayout
      preheader={`Your trial ends ${trialEndsLabel}. ${
        billingConfigured
          ? "Confirm or cancel before then."
          : "Add billing to keep access."
      }`}
      companyPostalAddress={companyPostalAddress}
    >
      <h1
        style={{
          margin: "0 0 24px 0",
          fontSize: "22px",
          lineHeight: "30px",
          fontWeight: 700,
          color: "#0f172a",
        }}
      >
        Your trial ends {trialEndsLabel}
      </h1>
      <p style={paragraphStyle}>{greeting(recipientName)}</p>
      <p style={paragraphStyle}>
        Quick reminder that your free trial for <strong>{communityName}</strong>{" "}
        started on {trialStartedLabel} and ends on {trialEndsLabel}.
      </p>
      <p style={paragraphStyle}>{actionLine}</p>
      <div style={{ margin: "32px 0 8px 0" }}>
        <a href={ctaUrl} style={buttonStyle}>
          {ctaLabel}
        </a>
      </div>
      <p style={{ ...paragraphStyle, fontSize: "14px", color: "#6b7280" }}>
        Manage billing any time from the Billing page in Gavelhouse.
      </p>
    </BaseLayout>
  );
}
