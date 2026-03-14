CREATE TABLE `session_files` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`original_name` text NOT NULL,
	`stored_name` text NOT NULL,
	`relative_path` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_files_session_idx` ON `session_files` (`session_id`);--> statement-breakpoint
CREATE INDEX `session_files_created_at_idx` ON `session_files` (`created_at`);