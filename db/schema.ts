import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const channels = sqliteTable("channels", {
  id: text("id").primaryKey(),
  twitchChannelId: text("twitch_channel_id").notNull(),
  username: text("username").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("idx_channels_twitch_channel_id").on(table.twitchChannelId)]);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  twitchUserId: text("twitch_user_id").notNull(),
  username: text("username").notNull(),
}, (table) => [uniqueIndex("idx_users_twitch_user_id").on(table.twitchUserId)]);

export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  channelId: text("channel_id").notNull(),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),
  text: text("text").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
}, (table) => [index("idx_tasks_channel_user").on(table.channelId, table.userId)]);

export const pomodoroSessions = sqliteTable("pomodoro_sessions", {
  channelId: text("channel_id").primaryKey(),
  currentSession: integer("current_session").notNull(),
  totalSessions: integer("total_sessions").notNull(),
  focusDuration: integer("focus_duration").notNull(),
  breakDuration: integer("break_duration").notNull(),
  status: text("status").notNull(),
  phase: text("phase").notNull(),
  remainingSeconds: integer("remaining_seconds").notNull(),
  phaseStartedAt: integer("phase_started_at"),
  updatedAt: text("updated_at").notNull(),
});

export const processedEvents = sqliteTable("processed_events", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [index("idx_processed_events_expiry").on(table.expiresAt)]);
