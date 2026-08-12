CREATE TABLE `auth_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_auth_sessions_channel` ON `auth_sessions` (`channel_id`);--> statement-breakpoint
CREATE TABLE `chat_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`twitch_message_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`user_id` text NOT NULL,
	`username` text NOT NULL,
	`role` text NOT NULL,
	`message` text NOT NULL,
	`reply` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_chat_events_twitch_message` ON `chat_events` (`twitch_message_id`);--> statement-breakpoint
CREATE INDEX `idx_chat_events_channel_created` ON `chat_events` (`channel_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `command_cooldowns` (
	`channel_id` text NOT NULL,
	`user_id` text NOT NULL,
	`command` text NOT NULL,
	`last_used_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_command_cooldowns_key` ON `command_cooldowns` (`channel_id`,`user_id`,`command`);--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `channels` ADD `connected_at` text;--> statement-breakpoint
ALTER TABLE `channels` ADD `twitch_access_token` text;--> statement-breakpoint
ALTER TABLE `channels` ADD `twitch_refresh_token` text;--> statement-breakpoint
ALTER TABLE `channels` ADD `token_expires_at` integer;--> statement-breakpoint
ALTER TABLE `channels` ADD `eventsub_status` text;--> statement-breakpoint
ALTER TABLE `channels` ADD `eventsub_subscription_id` text;