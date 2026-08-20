import {
  roleCan,
  type BoardRole,
  type RoleCapability,
} from "@boardstack/shared";
import type { Db } from "../../db/client.js";
import { getCommunityMembership } from "./access.js";

export async function hasReportCapability(
  db: Db,
  communityId: string,
  userId: string,
  capability: RoleCapability,
): Promise<boolean> {
  const membership = await getCommunityMembership(db, communityId, userId);
  return roleCan(membership?.role as BoardRole | undefined, capability);
}
