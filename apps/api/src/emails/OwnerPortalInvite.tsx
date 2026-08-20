import * as React from "react";
import { BaseLayout } from "./BaseLayout.js";

export type OwnerPortalInviteProps = {
  firstName: string;
  communityName: string;
  portalUrl: string;
  expiresAtLabel: string;
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

export function OwnerPortalInvite({
  firstName,
  communityName,
  portalUrl,
  expiresAtLabel,
  companyPostalAddress,
}: OwnerPortalInviteProps): React.ReactElement {
  return (
    <BaseLayout
      preheader={`Open your secure ${communityName} owner portal link.`}
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
        {`Your ${communityName} owner portal link`}
      </h1>
      <p style={paragraphStyle}>{`Hi ${firstName},`}</p>
      <p style={paragraphStyle}>
        Your board has created a secure Gavelhouse owner portal link for your
        account. Use it to view assessments and submit architectural requests.
      </p>
      <div style={{ margin: "32px 0 8px 0" }}>
        <a href={portalUrl} style={buttonStyle}>
          Open owner portal
        </a>
      </div>
      <p style={{ ...paragraphStyle, fontSize: "14px", color: "#6b7280" }}>
        {`This link expires ${expiresAtLabel}.`}
      </p>
      <p style={{ ...paragraphStyle, fontSize: "14px", color: "#6b7280" }}>
        {`- ${communityName} Board`}
      </p>
    </BaseLayout>
  );
}
