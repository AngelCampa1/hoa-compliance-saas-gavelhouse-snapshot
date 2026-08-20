import * as React from "react";

export type BaseLayoutProps = {
  preheader: string;
  unsubscribeUrl?: string;
  /**
   * Physical postal address rendered in the CAN-SPAM footer. Threaded through
   * from the mailer, which reads it from `env.COMPANY_POSTAL_ADDRESS`. Required
   * so the layout cannot silently render a placeholder in production.
   */
  companyPostalAddress: string;
  /**
   * Override the default footer tagline. Used by transactional emails sent on
   * behalf of a community (e.g. dues reminders) so the footer reads as that
   * community's correspondence rather than Gavelhouse marketing.
   */
  footerBlurb?: string;
  children: React.ReactNode;
};

/**
 * Branded email shell used by every transactional template.
 *
 * The layout is table-based to maximise compatibility with Outlook and older
 * mobile clients. Inline styles are used throughout for the same reason —
 * many email clients strip `<style>` blocks or ignore class selectors.
 *
 * Contains the physical postal address required for commercial email. Nurture
 * emails pass an unsubscribe URL so the footer includes an opt-out link; pure
 * resource-delivery emails omit it. The address is injected by the mailer from
 * `env.COMPANY_POSTAL_ADDRESS`; the mailer refuses to send when that env var
 * is missing, so this component never has to invent a value.
 */
export function BaseLayout({
  preheader,
  unsubscribeUrl,
  companyPostalAddress,
  footerBlurb,
  children,
}: BaseLayoutProps): React.ReactElement {
  const blurb =
    footerBlurb ??
    "Compliance-first HOA and condo management for self-managed boards.";
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Gavelhouse</title>
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: "#f3f4f6",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        }}
      >
        {/* Hidden preheader — shown in the email client preview pane. */}
        <div
          style={{
            display: "none",
            fontSize: "1px",
            color: "#f3f4f6",
            lineHeight: "1px",
            maxHeight: "0px",
            maxWidth: "0px",
            opacity: 0,
            overflow: "hidden",
          }}
        >
          {preheader}
        </div>

        <table
          role="presentation"
          cellPadding={0}
          cellSpacing={0}
          width="100%"
          style={{ backgroundColor: "#f3f4f6", padding: "24px 0" }}
        >
          <tbody>
            <tr>
              <td align="center">
                <table
                  role="presentation"
                  cellPadding={0}
                  cellSpacing={0}
                  width={600}
                  style={{
                    maxWidth: "600px",
                    width: "100%",
                    backgroundColor: "#ffffff",
                    borderRadius: "8px",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <tbody>
                    <tr>
                      <td
                        style={{
                          padding: "24px 32px",
                          borderBottom: "1px solid #e5e7eb",
                        }}
                      >
                        <div
                          aria-label="Gavelhouse logo"
                          role="img"
                          style={{
                            display: "inline-block",
                            fontSize: "0",
                          }}
                        >
                          <span
                            style={{
                              display: "inline-block",
                              width: "34px",
                              height: "24px",
                              marginRight: "12px",
                              verticalAlign: "middle",
                            }}
                          >
                            <span
                              style={{
                                display: "block",
                                height: "7px",
                                marginBottom: "3px",
                                borderRadius: "3px",
                                backgroundColor: "#163a5f",
                              }}
                            />
                            <span
                              style={{
                                display: "block",
                                height: "6px",
                                marginBottom: "3px",
                                borderRadius: "3px",
                                backgroundColor: "#2d4e6f",
                              }}
                            />
                            <span
                              style={{
                                display: "block",
                                height: "5px",
                                borderRadius: "3px",
                                backgroundColor: "#cb8a2e",
                              }}
                            />
                          </span>
                          <span
                            style={{
                              display: "inline-block",
                              fontSize: "20px",
                              fontWeight: 700,
                              letterSpacing: "0",
                              verticalAlign: "middle",
                            }}
                          >
                            <span style={{ color: "#163a5f" }}>Gavel</span>
                            <span style={{ color: "#cb8a2e" }}>house</span>
                          </span>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: "32px" }}>{children}</td>
                    </tr>
                    <tr>
                      <td
                        style={{
                          padding: "24px 32px",
                          borderTop: "1px solid #e5e7eb",
                          fontSize: "12px",
                          lineHeight: "18px",
                          color: "#6b7280",
                        }}
                      >
                        <p style={{ margin: "0 0 8px 0" }}>{blurb}</p>
                        <p style={{ margin: "0 0 8px 0" }}>
                          {companyPostalAddress}
                        </p>
                        {unsubscribeUrl && (
                          <p style={{ margin: 0 }}>
                            <a
                              href={unsubscribeUrl}
                              style={{
                                color: "#6b7280",
                                textDecoration: "underline",
                                fontWeight: 400,
                              }}
                            >
                              Unsubscribe from these emails
                            </a>
                          </p>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}
