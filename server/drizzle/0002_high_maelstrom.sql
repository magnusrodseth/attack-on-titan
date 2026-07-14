CREATE TABLE `daily_runs` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`claimed_at` integer NOT NULL,
	`mode` text NOT NULL,
	`map` text NOT NULL,
	`seed` text NOT NULL,
	`metric` text,
	`time_s` real,
	`level` integer,
	`score` integer,
	`wave` integer,
	`submitted_at` integer,
	PRIMARY KEY(`user_id`, `date`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
