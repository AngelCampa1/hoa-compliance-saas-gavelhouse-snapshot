import { z } from "zod";

export const CommunityRole = z.enum([
  "owner",
  "admin",
  "treasurer",
  "secretary",
  "viewer",
]);
export type CommunityRole = z.infer<typeof CommunityRole>;

export const createCommunityInput = z.object({
  name: z.string().min(1).max(256),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  state: z
    .string()
    .regex(/^[A-Z]{2}$/, "State must be a 2-letter uppercase US state code"),
});

export const communitySetupInput = z.object({
  communityId: z.string().min(1).optional(),
  name: z.string().min(1).max(256).optional(),
  state: z
    .string()
    .regex(/^[A-Z]{2}$/, "State must be a 2-letter uppercase US state code")
    .optional(),
});

export type CommunitySetupInput = z.infer<typeof communitySetupInput>;

export const inviteMemberInput = z.object({
  email: z.string().email(),
  role: CommunityRole.exclude(["owner"]),
});

export type CreateCommunityInput = z.infer<typeof createCommunityInput>;
export type InviteMemberInput = z.infer<typeof inviteMemberInput>;
