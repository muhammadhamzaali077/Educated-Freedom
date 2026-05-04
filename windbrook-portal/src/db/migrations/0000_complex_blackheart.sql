CREATE TABLE `account_balance_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`balance_cents` integer NOT NULL,
	`cash_balance_cents` integer,
	`as_of_date` text NOT NULL,
	`is_stale` integer DEFAULT false NOT NULL,
	`recorded_in_report_id` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recorded_in_report_id`) REFERENCES `reports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`person_index` integer,
	`account_class` text NOT NULL,
	`account_type` text NOT NULL,
	`institution` text NOT NULL,
	`account_number_last_four` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	`is_joint` integer DEFAULT false NOT NULL,
	`floor_cents` integer DEFAULT 100000 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "account_retirement_ownership" CHECK(("accounts"."account_class" <> 'retirement') OR ("accounts"."person_index" IS NOT NULL AND "accounts"."is_joint" = 0)),
	CONSTRAINT "account_person_index_valid" CHECK("accounts"."person_index" IS NULL OR "accounts"."person_index" IN (1, 2))
);
--> statement-breakpoint
CREATE TABLE `auth_account` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `bubble_layouts` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`report_type` text NOT NULL,
	`layout_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `client_persons` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`person_index` integer NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`date_of_birth` text NOT NULL,
	`ssn_last_four` text NOT NULL,
	`monthly_inflow_cents` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "client_person_index_check" CHECK("client_persons"."person_index" IN (1, 2)),
	CONSTRAINT "client_person_ssn_length" CHECK(length("client_persons"."ssn_last_four") = 4)
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`household_name` text NOT NULL,
	`meeting_cadence` text DEFAULT 'quarterly' NOT NULL,
	`trust_property_address` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `expense_budget` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`monthly_outflow_cents` integer NOT NULL,
	`automated_transfer_day` integer DEFAULT 28 NOT NULL,
	`homeowner_deductible_cents` integer DEFAULT 0 NOT NULL,
	`auto_deductible_cents` integer DEFAULT 0 NOT NULL,
	`medical_deductible_cents` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_budget_client_id_unique` ON `expense_budget` (`client_id`);--> statement-breakpoint
CREATE TABLE `liabilities` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`creditor_name` text NOT NULL,
	`liability_type` text NOT NULL,
	`balance_cents` integer NOT NULL,
	`interest_rate_bps` integer,
	`payoff_date` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`report_type` text NOT NULL,
	`meeting_date` text NOT NULL,
	`generated_at` integer NOT NULL,
	`generated_by_user_id` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`pdf_path` text,
	`canva_design_id` text,
	`canva_edit_url` text,
	`status` text DEFAULT 'draft' NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generated_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reports_client_meeting_idx` ON `reports` (`client_id`,`meeting_date`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
