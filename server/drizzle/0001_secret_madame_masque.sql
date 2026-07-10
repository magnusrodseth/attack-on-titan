CREATE TABLE `trials` (
	`user_id` text NOT NULL,
	`mode` text NOT NULL,
	`seed` text NOT NULL,
	`time_s` real,
	`splits` text,
	`level` integer,
	`score` integer,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `mode`, `seed`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
