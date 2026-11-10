-- #42: how totals count time that overlaps; gross sums every interval, net counts the overlap once.
ALTER TABLE "workspaces" ADD COLUMN "hours_count_mode" varchar(5) DEFAULT 'gross' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "ck_workspaces_hours_count_mode" CHECK ("workspaces"."hours_count_mode" IN ('gross', 'net'));