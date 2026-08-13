CREATE TABLE `overlay_branding` (
	`channel_id` text PRIMARY KEY NOT NULL,
	`logo_data` blob NOT NULL,
	`logo_filename` text NOT NULL,
	`logo_position` text DEFAULT 'bottom-right' NOT NULL,
	`logo_size` integer DEFAULT 84 NOT NULL,
	`updated_at` text NOT NULL
);
