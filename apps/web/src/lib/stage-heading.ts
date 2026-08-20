import type { BuyerStage } from "./types";

export function stageHeading(stage: BuyerStage | undefined): string {
  if (stage === "tofu") return "Go deeper";
  if (stage === "mofu") return "Compare options";
  if (stage === "bofu") return "See your options";
  return "Keep reading";
}
