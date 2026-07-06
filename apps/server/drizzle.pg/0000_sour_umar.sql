CREATE TYPE "public"."file_bucket_provider" AS ENUM('memory', 'r2');--> statement-breakpoint
CREATE TYPE "public"."file_status" AS ENUM('uploading', 'available', 'expired', 'deleted', 'failed');--> statement-breakpoint
CREATE TYPE "public"."product_export_part_status" AS ENUM('pending', 'processing', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."product_export_status" AS ENUM('queued', 'bulk_operation_running', 'bulk_operation_completed', 'generating_csv', 'ready', 'requires_node_finalize', 'failed', 'canceled');--> statement-breakpoint
CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_domain" text NOT NULL,
	"original_name" text NOT NULL,
	"safe_name" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" bigint DEFAULT 0 NOT NULL,
	"bucket_provider" "file_bucket_provider" NOT NULL,
	"bucket_key" text NOT NULL,
	"status" "file_status" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "product_export_parts" (
	"id" text PRIMARY KEY NOT NULL,
	"export_id" text NOT NULL,
	"seq" bigint NOT NULL,
	"status" "product_export_part_status" NOT NULL,
	"range_start" bigint NOT NULL,
	"range_end" bigint NOT NULL,
	"bucket_provider" text,
	"bucket_key" text,
	"byte_size" bigint,
	"row_count" bigint,
	"attempts" bigint NOT NULL,
	"error_code" text,
	"error_message" text,
	"locked_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_exports" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_domain" text NOT NULL,
	"shopify_session_id" text,
	"name" text NOT NULL,
	"template" text DEFAULT 'basic' NOT NULL,
	"status" "product_export_status" NOT NULL,
	"shopify_bulk_operation_id" text,
	"shopify_bulk_operation_status" text,
	"result_url" text,
	"partial_data_url" text,
	"object_count" bigint,
	"file_size" bigint,
	"bucket_provider" text,
	"bucket_key" text,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "references" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_domain" text NOT NULL,
	"namespace" text NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"enabled" boolean NOT NULL,
	"system" boolean NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "shopify_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"shop" text NOT NULL,
	"state" text NOT NULL,
	"isOnline" boolean DEFAULT false NOT NULL,
	"scope" text,
	"expires" timestamp,
	"accessToken" text NOT NULL,
	"userId" bigint,
	"firstName" text,
	"lastName" text,
	"email" text,
	"accountOwner" boolean,
	"locale" text,
	"collaborator" boolean,
	"emailVerified" boolean,
	"refreshToken" text,
	"refreshTokenExpires" timestamp
);
--> statement-breakpoint
ALTER TABLE "product_export_parts" ADD CONSTRAINT "product_export_parts_export_id_product_exports_id_fk" FOREIGN KEY ("export_id") REFERENCES "public"."product_exports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_exports" ADD CONSTRAINT "product_exports_shopify_session_id_shopify_sessions_id_fk" FOREIGN KEY ("shopify_session_id") REFERENCES "public"."shopify_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_shop_created_id_idx" ON "files" USING btree ("shop_domain","created_at","id");--> statement-breakpoint
CREATE INDEX "files_shop_status_idx" ON "files" USING btree ("shop_domain","status");--> statement-breakpoint
CREATE INDEX "files_expires_at_idx" ON "files" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "product_export_parts_export_seq_idx" ON "product_export_parts" USING btree ("export_id","seq");--> statement-breakpoint
CREATE INDEX "product_export_parts_export_status_idx" ON "product_export_parts" USING btree ("export_id","status");--> statement-breakpoint
CREATE INDEX "product_exports_shop_created_id_idx" ON "product_exports" USING btree ("shop_domain","created_at","id");--> statement-breakpoint
CREATE INDEX "product_exports_shop_status_created_id_idx" ON "product_exports" USING btree ("shop_domain","status","created_at","id");--> statement-breakpoint
CREATE INDEX "product_exports_status_updated_id_idx" ON "product_exports" USING btree ("status","updated_at","id");--> statement-breakpoint
CREATE INDEX "product_exports_bulk_operation_idx" ON "product_exports" USING btree ("shopify_bulk_operation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "references_shop_namespace_code_idx" ON "references" USING btree ("shop_domain","namespace","code");--> statement-breakpoint
CREATE INDEX "references_shop_namespace_sort_idx" ON "references" USING btree ("shop_domain","namespace","enabled","sort_order","code");