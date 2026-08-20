import * as React from "react";
import { BaseLayout } from "./BaseLayout.js";

export type TrialStartedProps = {
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

export function TrialStarted({
  recipientName,
  communityName,
  planName,
  amountLabel,
  trialStartedLabel,
  trialEndsLabel,
  billingConfigured,
  ctaUrl,
  companyPostalAddress,
}: TrialStartedProps): React.ReactElement {
  const billingLine = billingConfigured
    ? `Your ${planName} plan begins billing on ${trialEndsLabel} — we'll automatically charge ${amountLabel} to the card on file unless you cancel before then.`
    : `Your ${planName} trial ends on ${trialEndsLabel}. Add a payment method before then to keep access without interruption.`;

  const ctaLabel = billingConfigured ? "Manage billing" : "Add payment method";
  const preheader = billingConfigured
    ? `Trial active until ${trialEndsLabel}. Manage billing any time.`
    : `Trial active until ${trialEndsLabel}. Add a payment method to stay on after.`;

  return (
    <BaseLayout
      preheader={preheader}
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
        Your Gavelhouse trial is live
      </h1>
      <p style={paragraphStyle}>{greeting(recipientName)}</p>
      <p style={paragraphStyle}>
        Your free trial for <strong>{communityName}</strong> started on{" "}
        {trialStartedLabel} and runs through {trialEndsLabel}. The full{" "}
        {planName} plan is unlocked — reserve fund accounting, owner ledgers,
        governance documents, and the rest.
      </p>
      <p style={paragraphStyle}>{billingLine}</p>
      <div style={{ margin: "32px 0 8px 0" }}>
        <a href={ctaUrl} style={buttonStyle}>
          {ctaLabel}
        </a>
      </div>
      <p style={{ ...paragraphStyle, fontSize: "14px", color: "#6b7280" }}>
        You can review or cancel billing any time from the Billing page in
        Gavelhouse.
      </p>
    </BaseLayout>
  );
}
