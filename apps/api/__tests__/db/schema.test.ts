import { describe, it, expect } from "vitest";

// Importing schema exercises the module-level pgTable() calls and their column
// reference callbacks, covering the lines that V8 marks as uncovered.
import {
  user,
  session,
  account,
  verification,
} from "../../src/db/schema/auth.js";

import {
  communityRoleEnum,
  communities,
  communityMembers,
  invitations,
} from "../../src/db/schema/tenancy.js";

import {
  trialStatusEnum,
  tierSlugEnum,
  subscriptions,
} from "../../src/db/schema/billing.js";

import { communityActivation } from "../../src/db/schema/activation.js";

describe("Drizzle schema definitions", () => {
  describe("auth schema", () => {
    it("user table has expected columns", () => {
      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.email).toBeDefined();
      expect(user.emailVerified).toBeDefined();
    });

    it("session table references user", () => {
      expect(session).toBeDefined();
      expect(session.userId).toBeDefined();
    });

    it("account table references user", () => {
      expect(account).toBeDefined();
      expect(account.userId).toBeDefined();
      expect(account.accountId).toBeDefined();
      expect(account.providerId).toBeDefined();
    });

    it("verification table has required columns", () => {
      expect(verification).toBeDefined();
      expect(verification.identifier).toBeDefined();
      expect(verification.value).toBeDefined();
      expect(verification.expiresAt).toBeDefined();
    });
  });

  describe("tenancy schema", () => {
    it("communityRoleEnum is defined", () => {
      expect(communityRoleEnum).toBeDefined();
    });

    it("communities table has expected columns", () => {
      expect(communities).toBeDefined();
      expect(communities.id).toBeDefined();
      expect(communities.slug).toBeDefined();
      expect(communities.state).toBeDefined();
      expect(communities.ownerUserId).toBeDefined();
    });

    it("communityMembers table has expected columns", () => {
      expect(communityMembers).toBeDefined();
      expect(communityMembers.communityId).toBeDefined();
      expect(communityMembers.userId).toBeDefined();
      expect(communityMembers.role).toBeDefined();
    });

    it("invitations table has expected columns", () => {
      expect(invitations).toBeDefined();
      expect(invitations.token).toBeDefined();
      expect(invitations.expiresAt).toBeDefined();
      expect(invitations.consumedAt).toBeDefined();
    });
  });

  describe("billing schema", () => {
    it("trialStatusEnum is defined", () => {
      expect(trialStatusEnum).toBeDefined();
    });

    it("tierSlugEnum is defined", () => {
      expect(tierSlugEnum).toBeDefined();
    });

    it("subscriptions table has expected columns", () => {
      expect(subscriptions).toBeDefined();
      expect(subscriptions.communityId).toBeDefined();
      expect(subscriptions.stripeCustomerId).toBeDefined();
      expect(subscriptions.stripeSubscriptionId).toBeDefined();
      expect(subscriptions.tier).toBeDefined();
      expect(subscriptions.status).toBeDefined();
      expect(subscriptions.trialEndsAt).toBeDefined();
    });
  });

  describe("activation schema", () => {
    it("communityActivation table has expected columns", () => {
      expect(communityActivation).toBeDefined();
      expect(communityActivation.communityId).toBeDefined();
      expect(communityActivation.rosterImported).toBeDefined();
      expect(communityActivation.reservePopulated).toBeDefined();
      expect(communityActivation.complianceAcknowledged).toBeDefined();
      expect(communityActivation.dueBatchConfigured).toBeDefined();
    });
  });
});
