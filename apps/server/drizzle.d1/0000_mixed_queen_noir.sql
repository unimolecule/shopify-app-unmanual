CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_domain` text NOT NULL,
	`original_name` text NOT NULL,
	`safe_name` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_size` integer DEFAULT 0 NOT NULL,
	`bucket_provider` text NOT NULL,
	`bucket_key` text NOT NULL,
	`status` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `files_shop_created_id_idx` ON `files` (`shop_domain`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `files_shop_status_idx` ON `files` (`shop_domain`,`status`);--> statement-breakpoint
CREATE INDEX `files_expires_at_idx` ON `files` (`expires_at`);--> statement-breakpoint
CREATE TABLE `product_export_parts` (
	`id` text PRIMARY KEY NOT NULL,
	`export_id` text NOT NULL,
	`seq` integer NOT NULL,
	`status` text NOT NULL,
	`range_start` integer NOT NULL,
	`range_end` integer NOT NULL,
	`bucket_provider` text,
	`bucket_key` text,
	`byte_size` integer,
	`row_count` integer,
	`attempts` integer NOT NULL,
	`error_code` text,
	`error_message` text,
	`locked_at` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`export_id`) REFERENCES `product_exports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_export_parts_export_seq_idx` ON `product_export_parts` (`export_id`,`seq`);--> statement-breakpoint
CREATE INDEX `product_export_parts_export_status_idx` ON `product_export_parts` (`export_id`,`status`);--> statement-breakpoint
CREATE TABLE `product_exports` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_domain` text NOT NULL,
	`shopify_session_id` text,
	`name` text NOT NULL,
	`template` text DEFAULT 'basic' NOT NULL,
	`status` text NOT NULL,
	`shopify_bulk_operation_id` text,
	`shopify_bulk_operation_status` text,
	`result_url` text,
	`partial_data_url` text,
	`object_count` integer,
	`file_size` integer,
	`bucket_provider` text,
	`bucket_key` text,
	`error_code` text,
	`error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`shopify_session_id`) REFERENCES `shopify_sessions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `product_exports_shop_created_id_idx` ON `product_exports` (`shop_domain`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `product_exports_shop_status_created_id_idx` ON `product_exports` (`shop_domain`,`status`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `product_exports_status_updated_id_idx` ON `product_exports` (`status`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `product_exports_bulk_operation_idx` ON `product_exports` (`shopify_bulk_operation_id`);--> statement-breakpoint
CREATE TABLE `references` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_domain` text NOT NULL,
	`namespace` text NOT NULL,
	`code` text NOT NULL,
	`label` text NOT NULL,
	`enabled` integer NOT NULL,
	`system` integer NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `references_shop_namespace_code_idx` ON `references` (`shop_domain`,`namespace`,`code`);--> statement-breakpoint
CREATE INDEX `references_shop_namespace_sort_idx` ON `references` (`shop_domain`,`namespace`,`enabled`,`sort_order`,`code`);--> statement-breakpoint
CREATE TABLE `shopify_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`shop` text NOT NULL,
	`state` text NOT NULL,
	`isOnline` integer DEFAULT false NOT NULL,
	`scope` text,
	`expires` text,
	`accessToken` text NOT NULL,
	`userId` blob,
	`firstName` text,
	`lastName` text,
	`email` text,
	`accountOwner` integer,
	`locale` text,
	`collaborator` integer,
	`emailVerified` integer,
	`refreshToken` text,
	`refreshTokenExpires` text
);
