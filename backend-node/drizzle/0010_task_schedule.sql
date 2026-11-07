-- Task scheduling: the day and optional start time of a task, in the workspace's timezone, and when that
-- schedule brought the task to Today. The time needs a day and moves in steps of 15 minutes.
ALTER TABLE "tasks" ADD COLUMN "scheduled_on" date;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "scheduled_time" time;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "schedule_applied_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "ix_tasks_schedule_due" ON "tasks" USING btree ("list_id","scheduled_on") WHERE "tasks"."scheduled_on" IS NOT NULL AND "tasks"."schedule_applied_at" IS NULL AND "tasks"."column" IN ('backlog', 'this_week');--> statement-breakpoint
CREATE INDEX "ix_tasks_scheduled_on" ON "tasks" USING btree ("scheduled_on") WHERE "tasks"."scheduled_on" IS NOT NULL AND "tasks"."column" <> 'done';--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "ck_tasks_schedule_time_needs_day" CHECK ("tasks"."scheduled_time" IS NULL OR "tasks"."scheduled_on" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "ck_tasks_schedule_time_step" CHECK ("tasks"."scheduled_time" IS NULL OR (extract(minute FROM "tasks"."scheduled_time")::int % 15 = 0 AND extract(second FROM "tasks"."scheduled_time") = 0));