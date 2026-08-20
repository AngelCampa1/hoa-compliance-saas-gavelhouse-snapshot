import * as React from "react";
import { BaseLayout } from "./BaseLayout.js";

export type SignupConfirmationProps = {
  recipientName: string | null | undefined;
  verificationUrl: string;
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

export function SignupConfirmation({
  recipientName,
  verificationUrl,
  companyPostalAddress,
}: SignupConfirmationProps): React.ReactElement {
  return (
    <BaseLayout
      preheader="Confirm your email to keep Gavelhouse account notices going to the right inbox."
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
        Confirm your email
      </h1>
      <p style={paragraphStyle}>{greeting(recipientName)}</p>
      <p style={paragraphStyle}>
        Welcome to Gavelhouse. Please confirm this email address so account
        notices, trial updates, and board workflow reminders reach the right
        inbox.
      </p>
      <div style={{ margin: "32px 0 8px 0" }}>
        <a href={verificationUrl} style={buttonStyle}>
          Confirm your email
        </a>
      </div>
      <p style={{ ...paragraphStyle, fontSize: "14px", color: "#6b7280" }}>
        You can keep using Gavelhouse while this is pending.
      </p>
    </BaseLayout>
  );
}
