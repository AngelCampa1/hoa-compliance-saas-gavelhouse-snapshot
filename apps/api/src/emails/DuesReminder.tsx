import * as React from "react";
import { BaseLayout } from "./BaseLayout.js";

export type DuesReminderProps = {
  firstName: string;
  communityName: string;
  amountLabel: string;
  dueDate: string;
  portalUrl: string;
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

export function DuesReminder({
  firstName,
  communityName,
  amountLabel,
  dueDate,
  portalUrl,
  companyPostalAddress,
}: DuesReminderProps): React.ReactElement {
  return (
    <BaseLayout
      preheader={`${amountLabel} was due on ${dueDate}. Pay through your owner portal.`}
      companyPostalAddress={companyPostalAddress}
      footerBlurb={`Sent on behalf of ${communityName} via Gavelhouse.`}
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
        {`Payment reminder from ${communityName}`}
      </h1>
      <p style={paragraphStyle}>{`Hi ${firstName},`}</p>
      <p style={paragraphStyle}>
        Your HOA assessment of <strong>{amountLabel}</strong>
        {` was due on ${dueDate}. If you've already paid, please disregard this notice.`}
      </p>
      <p style={paragraphStyle}>
        Open your owner portal to view your current balance and submit payment.
      </p>
      <div style={{ margin: "32px 0 8px 0" }}>
        <a href={portalUrl} style={buttonStyle}>
          Pay your assessment
        </a>
      </div>
      <p style={{ ...paragraphStyle, fontSize: "14px", color: "#6b7280" }}>
        {`— ${communityName} Board`}
      </p>
    </BaseLayout>
  );
}
