CREATE TABLE "lists" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"color" smallint NOT NULL,
	"position" integer NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subtasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"list_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"estimate_minutes" integer,
	"column" varchar(16) NOT NULL,
	"position" integer NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ck_tasks_column" CHECK ("tasks"."column" IN ('backlog', 'this_week', 'today', 'done')),
	CONSTRAINT "ck_tasks_estimate_minutes" CHECK ("tasks"."estimate_minutes" BETWEEN 1 AND 1440),
	CONSTRAINT "ck_tasks_done_completed_at" CHECK (("tasks"."column" = 'done') = ("tasks"."completed_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_lists_workspace_id" ON "lists" USING btree ("workspace_id","position");--> statement-breakpoint
CREATE INDEX "ix_subtasks_task_id" ON "subtasks" USING btree ("task_id","position");--> statement-breakpoint
CREATE INDEX "ix_tasks_list_column_position" ON "tasks" USING btree ("list_id","column","position");