-- Task series: a recurrence rule (daily, weekly on some weekdays, or monthly on a day) with an optional end by
-- date or by count. Each occurrence is a task pointing at its series; deleting the series keeps the tasks.
CREATE TABLE "task_series" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"freq" varchar(8) NOT NULL,
	"interval" smallint DEFAULT 1 NOT NULL,
	"weekdays" smallint[],
	"month_day" smallint,
	"until" date,
	"count" smallint,
	"created_count" smallint DEFAULT 1 NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ck_task_series_freq" CHECK ("task_series"."freq" IN ('daily', 'weekly', 'monthly')),
	CONSTRAINT "ck_task_series_interval" CHECK ("task_series"."interval" BETWEEN 1 AND 99),
	CONSTRAINT "ck_task_series_weekdays" CHECK ("task_series"."weekdays" IS NULL OR (cardinality("task_series"."weekdays") >= 1 AND "task_series"."weekdays" <@ ARRAY[1,2,3,4,5,6,7]::smallint[])),
	CONSTRAINT "ck_task_series_month_day" CHECK ("task_series"."month_day" BETWEEN 1 AND 31),
	CONSTRAINT "ck_task_series_count" CHECK ("task_series"."count" BETWEEN 1 AND 999),
	CONSTRAINT "ck_task_series_until_or_count" CHECK ("task_series"."until" IS NULL OR "task_series"."count" IS NULL),
	CONSTRAINT "ck_task_series_weekly_weekdays" CHECK (("task_series"."freq" = 'weekly') = ("task_series"."weekdays" IS NOT NULL)),
	CONSTRAINT "ck_task_series_monthly_month_day" CHECK (("task_series"."freq" = 'monthly') = ("task_series"."month_day" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "series_id" uuid;--> statement-breakpoint
ALTER TABLE "task_series" ADD CONSTRAINT "task_series_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_task_series_workspace" ON "task_series" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_series_id_task_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."task_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_tasks_series" ON "tasks" USING btree ("series_id") WHERE "tasks"."series_id" IS NOT NULL;