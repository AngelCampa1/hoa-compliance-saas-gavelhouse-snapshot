import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { communities, communityRoleEnum } from "./tenancy.js";
import { user } from "./auth.js";
import { units, homeowners } from "./dues.js";

// Violations
export const violationStatusEnum = pgEnum("violation_status", [
  "open",
  "notified",
  "cured",
  "closed",
]);

export const violations = pgTable("violations", {
  id: text("id").primaryKey(),
  communityId: text("community_id")
    .notNull()
    .references(() => communities.id, { onDelete: "cascade" }),
  unitId: text("unit_id").references(() => units.id, { onDelete: "set null" }),
  homeownerId: text("homeowner_id").references(() => homeowners.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: violationStatusEnum("status").notNull().default("open"),
  createdByUserId: text("created_by_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  photoKeys: text("photo_keys").array(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const violationEvents = pgTable("violation_events", {
  id: text("id").primaryKey(),
  violationId: text("violation_id")
    .notNull()
    .references(() => violations.id, { onDelete: "cascade" }),
  communityId: text("community_id")
    .notNull()
    .references(() => communities.id, { onDelete: "cascade" }),
  toStatus: violationStatusEnum("to_status").notNull(),
  note: text("note"),
  actorUserId: text("actor_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Architectural Requests
export const archRequestStatusEnum = pgEnum("arch_request_status", [
  "pending",
  "approved",
  "approved_with_conditions",
  "denied",
]);

export const archRequests = pgTable("arch_requests", {
  id: text("id").primaryKey(),
  communityId: text("community_id")
    .notNull()
    .references(() => communities.id, { onDelete: "cascade" }),
  unitId: text("unit_id").references(() => units.id, { onDelete: "set null" }),
  homeownerId: text("homeowner_id").references(() => homeowners.id, {
    onDelete: "set null",
  }),
  requestType: text("request_type").notNull(),
  description: text("description").notNull(),
  attachmentKeys: text("attachment_keys").array(),
  status: archRequestStatusEnum("status").notNull().default("pending"),
  reviewNote: text("review_note"),
  reviewedByUserId: text("reviewed_by_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Meetings
export const meetingTypeEnum = pgEnum("meeting_type", [
  "annual",
  "special",
  "board",
]);

export const meetings = pgTable("meetings", {
  id: text("id").primaryKey(),
  communityId: text("community_id")
    .notNull()
    .references(() => communities.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  meetingType: meetingTypeEnum("meeting_type").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  location: text("location"),
  minutesText: text("minutes_text"),
  minutesFinalizedAt: timestamp("minutes_finalized_at", {
    withTimezone: true,
  }),
  createdByUserId: text("created_by_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Motions
export const motionStatusEnum = pgEnum("motion_status", [
  "pending",
  "passed",
  "failed",
  "tabled",
]);

export const motions = pgTable("motions", {
  id: text("id").primaryKey(),
  meetingId: text("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  communityId: text("community_id")
    .notNull()
    .references(() => communities.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  movedByUserId: text("moved_by_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  secondedByUserId: text("seconded_by_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  status: motionStatusEnum("status").notNull().default("pending"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Votes
export const voteChoiceEnum = pgEnum("vote_choice", ["yes", "no", "abstain"]);

export const votes = pgTable(
  "votes",
  {
    id: text("id").primaryKey(),
    motionId: text("motion_id")
      .notNull()
      .references(() => motions.id, { onDelete: "cascade" }),
    communityId: text("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    voterUserId: text("voter_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    choice: voteChoiceEnum("choice").notNull(),
    notes: text("notes"),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("votes_motion_voter_unique").on(
      table.motionId,
      table.voterUserId,
    ),
  ],
);

// Owner Portal Sessions
export const ownerPortalSessions = pgTable("owner_portal_sessions", {
  id: text("id").primaryKey(),
  homeownerId: text("homeowner_id")
    .notNull()
    .references(() => homeowners.id, { onDelete: "cascade" }),
  communityId: text("community_id")
    .notNull()
    .references(() => communities.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

// Board Transitions
export const boardTransitionStatusEnum = pgEnum("board_transition_status", [
  "pending",
  "acknowledged",
  "complete",
]);

export const boardTransitions = pgTable(
  "board_transitions",
  {
    id: text("id").primaryKey(),
    communityId: text("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    role: communityRoleEnum("role").notNull(),
    fromUserId: text("from_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    toUserId: text("to_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    status: boardTransitionStatusEnum("status").notNull().default("pending"),
    pendingItems: text("pending_items").array(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("board_transitions_active_role_unique")
      .on(table.communityId, table.role)
      .where(sql`${table.status} <> 'complete'`),
  ],
);
