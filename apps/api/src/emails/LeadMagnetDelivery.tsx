import * as React from "react";
import { BaseLayout } from "./BaseLayout.js";
import { renderMarkdownBlocks } from "./lib/renderMarkdownBlocks.js";
import type { MagnetEmailConfig } from "./content/magnets.js";

export type LeadMagnetDeliveryProps = {
  magnet: MagnetEmailConfig;
  downloadUrl: string;
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

export function LeadMagnetDelivery({
  magnet,
  downloadUrl,
  companyPostalAddress,
}: LeadMagnetDeliveryProps): React.ReactElement {
  return (
    <BaseLayout
      preheader={magnet.deliveryPreheader}
      companyPostalAddress={companyPostalAddress}
    >
      <h1
        style={{
          margin: "0 0 24px 0",
          fontSize: "24px",
          lineHeight: "32px",
          fontWeight: 700,
          color: "#0f172a",
        }}
      >
        Your {magnet.title} is ready
      </h1>
      {renderMarkdownBlocks(magnet.deliveryBodyMarkdown)}
      <div style={{ margin: "32px 0 8px 0" }}>
        <a href={downloadUrl} style={buttonStyle}>
          Download your PDF
        </a>
      </div>
      <p
        style={{
          margin: "16px 0 0 0",
          fontSize: "14px",
          lineHeight: "20px",
          color: "#6b7280",
        }}
      >
        If the button does not work, copy this link into your browser:{" "}
        <a
          href={downloadUrl}
          style={{ color: "#2563eb", textDecoration: "underline" }}
        >
          {downloadUrl}
        </a>
      </p>
    </BaseLayout>
  );
}
