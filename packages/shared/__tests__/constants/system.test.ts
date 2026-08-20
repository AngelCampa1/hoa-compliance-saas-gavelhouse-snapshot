import { describe, expect, it } from "vitest";
import {
  DUES_REMINDER_OVERDUE_INTERVAL_DAYS,
  LEAD_MAGNET_DOWNLOAD_LINK_EXPIRY_DAYS,
  OWNER_PORTAL_LINK_EXPIRY_DAYS,
  SYSTEM_ACTOR_ID,
} from "../../src/constants/system.js";

describe("system constants", () => {
  it("keeps system actor and operational durations in shared constants", () => {
    expect(SYSTEM_ACTOR_ID).toBe("system:stripe-webhook");
    expect(OWNER_PORTAL_LINK_EXPIRY_DAYS).toBe(30);
    expect(LEAD_MAGNET_DOWNLOAD_LINK_EXPIRY_DAYS).toBe(30);
    expect(DUES_REMINDER_OVERDUE_INTERVAL_DAYS).toEqual([1, 7, 14, 30]);
  });
});
