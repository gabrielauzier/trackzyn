-- #27: when a task was last updated (the agenda lists the 10 updated last), filled for existing tasks with the
-- later of their creation and their completion; and where a task came from when no token made it.
ALTER TABLE "tasks" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
UPDATE "tasks" SET "updated_at" = greatest("created_at", coalesce("completed_at", "created_at"));--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "created_from" varchar(16);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "ck_tasks_created_from" CHECK ("tasks"."created_from" IN ('agenda'));
