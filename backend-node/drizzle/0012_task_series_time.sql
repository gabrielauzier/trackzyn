-- The time of a series (D27): the next occurrence takes it, so moving one occurrence alone keeps the next ones
-- at the time of the series. Existing series take the time of their open occurrence.
ALTER TABLE "task_series" ADD COLUMN "time" time;--> statement-breakpoint
ALTER TABLE "task_series" ADD CONSTRAINT "ck_task_series_time_step" CHECK ("task_series"."time" IS NULL OR (extract(minute FROM "task_series"."time")::int % 15 = 0 AND extract(second FROM "task_series"."time") = 0));--> statement-breakpoint
UPDATE "task_series" AS s SET "time" = t."scheduled_time"
FROM "tasks" AS t
WHERE t."series_id" = s."id" AND t."column" <> 'done' AND t."scheduled_time" IS NOT NULL;
