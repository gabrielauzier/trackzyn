-- The day plan of a user (planejamento-diario): one header per user, workspace and day, and its task and break blocks.
CREATE TABLE "day_plan_blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plan_id" uuid NOT NULL,
	"kind" varchar(8) NOT NULL,
	"task_id" uuid,
	"name" varchar(40),
	"list_id" uuid,
	"start_time" time NOT NULL,
	"minutes" smallint NOT NULL,
	CONSTRAINT "ck_day_plan_blocks_kind" CHECK ("day_plan_blocks"."kind" IN ('task', 'break')),
	CONSTRAINT "ck_day_plan_blocks_shape" CHECK (("day_plan_blocks"."kind" = 'task' AND "day_plan_blocks"."task_id" IS NOT NULL AND "day_plan_blocks"."name" IS NULL AND "day_plan_blocks"."list_id" IS NULL) OR ("day_plan_blocks"."kind" = 'break' AND "day_plan_blocks"."task_id" IS NULL AND "day_plan_blocks"."name" IS NOT NULL AND char_length("day_plan_blocks"."name") BETWEEN 1 AND 40 AND "day_plan_blocks"."list_id" IS NOT NULL)),
	CONSTRAINT "ck_day_plan_blocks_minutes" CHECK (("day_plan_blocks"."kind" = 'task' AND "day_plan_blocks"."minutes" BETWEEN 5 AND 1440) OR ("day_plan_blocks"."kind" = 'break' AND "day_plan_blocks"."minutes" BETWEEN 5 AND 120)),
	CONSTRAINT "ck_day_plan_blocks_start_minute" CHECK (extract(second FROM "day_plan_blocks"."start_time") = 0)
);
--> statement-breakpoint
CREATE TABLE "day_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"day" date NOT NULL,
	"version" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "uq_day_plans_user_workspace_day" UNIQUE("user_id","workspace_id","day")
);
--> statement-breakpoint
ALTER TABLE "day_plan_blocks" ADD CONSTRAINT "day_plan_blocks_plan_id_day_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."day_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_plan_blocks" ADD CONSTRAINT "day_plan_blocks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_plan_blocks" ADD CONSTRAINT "day_plan_blocks_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_plans" ADD CONSTRAINT "day_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_plans" ADD CONSTRAINT "day_plans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_day_plan_blocks_plan_start" ON "day_plan_blocks" USING btree ("plan_id","start_time");--> statement-breakpoint
CREATE INDEX "ix_day_plan_blocks_task" ON "day_plan_blocks" USING btree ("task_id") WHERE "day_plan_blocks"."task_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_day_plan_blocks_list" ON "day_plan_blocks" USING btree ("list_id") WHERE "day_plan_blocks"."list_id" IS NOT NULL;