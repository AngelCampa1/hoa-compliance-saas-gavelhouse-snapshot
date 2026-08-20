import { z } from "zod";

export const PortfolioCreateInput = z.object({
  name: z.string().min(1).max(120),
});
export type PortfolioCreateInput = z.infer<typeof PortfolioCreateInput>;

export const PortfolioUpdateInput = z.object({
  name: z.string().min(1).max(120),
});
export type PortfolioUpdateInput = z.infer<typeof PortfolioUpdateInput>;

export const PortfolioLinkInput = z.object({
  portfolioId: z.string().min(1),
  communityId: z.string().min(1),
});
export type PortfolioLinkInput = z.infer<typeof PortfolioLinkInput>;
