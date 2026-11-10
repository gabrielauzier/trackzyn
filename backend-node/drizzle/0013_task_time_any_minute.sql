-- The time of a task and of a series takes any minute, as the HH:MM field of the picker (D34); seconds stay zero.
ALTER TABLE "task_series" DROP CONSTRAINT "ck_task_series_time_step";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "ck_tasks_schedule_time_step";--> statement-breakpoint
ALTER TABLE "task_series" ADD CONSTRAINT "ck_task_series_time_minute" CHECK ("task_series"."time" IS NULL OR extract(second FROM "task_series"."time") = 0);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "ck_tasks_schedule_time_minute" CHECK ("tasks"."scheduled_time" IS NULL OR extract(second FROM "tasks"."scheduled_time") = 0);