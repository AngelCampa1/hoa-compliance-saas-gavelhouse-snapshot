import type * as React from "react";

type BrandLogoProps = React.SVGProps<SVGSVGElement> & {
  variant?: "full" | "mark";
  tone?: "standard" | "inverse";
  title?: string;
};

type BrandMarkColors = {
  layerOne: "var(--bs-logo-layer-one)";
  layerTwo: "var(--bs-logo-layer-two)";
  layerThree: "var(--bs-logo-layer-three)";
  check: "var(--bs-logo-check)";
};

function BrandMark({ colors }: { colors: BrandMarkColors }) {
  return (
    <g data-brand-logo-mark="true">
      <path
        d="M12 26.4 31.8 15a6 6 0 0 1 6 0l19.8 11.4a3.8 3.8 0 0 1 0 6.6L37.8 44.4a6 6 0 0 1-6 0L12 33a3.8 3.8 0 0 1 0-6.6Z"
        fill={colors.layerOne}
      />
      <path
        d="M12 44.4 31.8 33a6 6 0 0 1 6 0l19.8 11.4a3.8 3.8 0 0 1 0 6.6L37.8 62.4a6 6 0 0 1-6 0L12 51a3.8 3.8 0 0 1 0-6.6Z"
        fill={colors.layerTwo}
      />
      <path
        d="M12 62.4 31.8 51a6 6 0 0 1 6 0l19.8 11.4a3.8 3.8 0 0 1 0 6.6L37.8 80.4a6 6 0 0 1-6 0L12 69a3.8 3.8 0 0 1 0-6.6Z"
        fill={colors.layerThree}
      />
      <path
        d="m24.8 25.3 9.4 8.2 24-27.3"
        fill="none"
        stroke={colors.check}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="7"
      />
    </g>
  );
}

export function BrandLogo({
  variant = "full",
  tone = "standard",
  title = "Gavelhouse",
  className,
  ...props
}: BrandLogoProps) {
  // The wordmark ends at x≈274 (measured: text starts at 112 and is ~162 wide
  // at 29px/700 in Public Sans). A 250-wide viewBox clipped the final "e".
  const viewBox = variant === "mark" ? "0 0 70 88" : "0 0 280 88";
  const toneClassName =
    tone === "inverse"
      ? "[--bs-logo-layer-one:#f4ecdf] [--bs-logo-layer-two:#e4d5c3] [--bs-logo-layer-three:#cb8a2e] [--bs-logo-check:#cb8a2e] [--bs-logo-board:#f4ecdf] [--bs-logo-stack:#cb8a2e] [--bs-logo-divider:#e4d5c3]"
      : "[--bs-logo-layer-one:#163a5f] [--bs-logo-layer-two:#2d4e6f] [--bs-logo-layer-three:#cb8a2e] [--bs-logo-check:#cb8a2e] [--bs-logo-board:#163a5f] [--bs-logo-stack:#cb8a2e] [--bs-logo-divider:#e4d5c3]";
  const markColors: BrandMarkColors = {
    layerOne: "var(--bs-logo-layer-one)",
    layerTwo: "var(--bs-logo-layer-two)",
    layerThree: "var(--bs-logo-layer-three)",
    check: "var(--bs-logo-check)",
  };

  return (
    <svg
      aria-label={title}
      role="img"
      viewBox={viewBox}
      className={[toneClassName, className].filter(Boolean).join(" ")}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <title>{title}</title>
      <BrandMark colors={markColors} />
      {variant === "full" && (
        <g data-brand-logo-wordmark="true">
          <path
            d="M88 16v56"
            stroke="var(--bs-logo-divider)"
            strokeWidth="1.5"
          />
          <text
            x="112"
            y="55"
            fontFamily="Public Sans, system-ui, sans-serif"
            fontSize="29"
            fontWeight="700"
            letterSpacing="0"
          >
            <tspan fill="var(--bs-logo-board)">Gavel</tspan>
            <tspan fill="var(--bs-logo-stack)">house</tspan>
          </text>
        </g>
      )}
    </svg>
  );
}
