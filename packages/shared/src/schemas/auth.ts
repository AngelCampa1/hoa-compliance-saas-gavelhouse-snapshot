import { z } from "zod";

export const signupInput = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(128),
  communityName: z.string().min(1).max(256).optional(),
  state: z
    .string()
    .regex(/^[A-Z]{2}$/, "State must be a 2-letter uppercase US state code")
    .optional(),
});

export const loginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const inviteAcceptInput = z.object({
  token: z.string().min(1),
  name: z.string().min(1).max(128).optional(),
  password: z.string().min(8).max(128).optional(),
});

export type SignupInput = z.infer<typeof signupInput>;
export type LoginInput = z.infer<typeof loginInput>;
export type InviteAcceptInput = z.infer<typeof inviteAcceptInput>;
