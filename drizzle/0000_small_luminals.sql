CREATE TABLE `limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`student` text,
	`role` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`group_id` text NOT NULL,
	`config` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `students_code_hash_unique` ON `students` (`code_hash`);--> statement-breakpoint
CREATE TABLE `turns` (
	`id` text PRIMARY KEY NOT NULL,
	`student` text NOT NULL,
	`request_id` text NOT NULL,
	`question` text NOT NULL,
	`code` text NOT NULL,
	`task` text NOT NULL,
	`answer` text,
	`status` text NOT NULL,
	`error` text,
	`mode` text NOT NULL,
	`created` integer NOT NULL,
	`completed` integer,
	FOREIGN KEY (`student`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `turn_request` ON `turns` (`student`,`request_id`);--> statement-breakpoint
CREATE INDEX `turn_student_time` ON `turns` (`student`,`created`);--> statement-breakpoint
CREATE UNIQUE INDEX `turn_pending` ON `turns` (`student`) WHERE "turns"."status" = 'pending';