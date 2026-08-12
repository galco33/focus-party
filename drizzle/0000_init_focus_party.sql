CREATE TABLE `channels` (
	`id` text PRIMARY KEY NOT NULL,
	`twitch_channel_id` text NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_channels_twitch_channel_id` ON `channels` (`twitch_channel_id`);--> statement-breakpoint
CREATE TABLE `pomodoro_sessions` (
	`channel_id` text PRIMARY KEY NOT NULL,
	`current_session` integer NOT NULL,
	`total_sessions` integer NOT NULL,
	`focus_duration` integer NOT NULL,
	`break_duration` integer NOT NULL,
	`status` text NOT NULL,
	`phase` text NOT NULL,
	`remaining_seconds` integer NOT NULL,
	`phase_started_at` integer,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `processed_events` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_processed_events_expiry` ON `processed_events` (`expires_at`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel_id` text NOT NULL,
	`user_id` text NOT NULL,
	`username` text NOT NULL,
	`text` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_channel_user` ON `tasks` (`channel_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`twitch_user_id` text NOT NULL,
	`username` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_twitch_user_id` ON `users` (`twitch_user_id`);