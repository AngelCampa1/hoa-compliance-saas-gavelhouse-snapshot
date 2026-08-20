import type {
  CtaAnalyticsContext,
  CtaLinkConfig,
  DecisionCtaCardProps,
} from "./types";

import { buildCtaAnalyticsAttributes } from "./cta-analytics";

export interface DecisionCtaCardLinkModel extends CtaLinkConfig {
  analyticsAttributes: Record<string, string>;
}

export interface DecisionCtaCardModel {
  heading: string;
  subtext: string;
  bullets: string[];
  primaryCta: DecisionCtaCardLinkModel;
  secondaryCta?: DecisionCtaCardLinkModel;
}

function buildTrackedLink(
  cta: CtaLinkConfig,
  analytics?: CtaAnalyticsContext,
): DecisionCtaCardLinkModel {
  return {
    ...cta,
    analyticsAttributes: buildCtaAnalyticsAttributes({
      ...analytics,
      target: cta.target,
    }),
  };
}

export function buildDecisionCtaCardModel(
  props: DecisionCtaCardProps,
): DecisionCtaCardModel {
  return {
    heading: props.heading,
    subtext: props.subtext,
    bullets: props.bullets ?? [],
    primaryCta: buildTrackedLink(props.primaryCta, props.analytics),
    secondaryCta: props.secondaryCta
      ? buildTrackedLink(props.secondaryCta, props.analytics)
      : undefined,
  };
}
