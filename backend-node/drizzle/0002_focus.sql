CREATE TABLE "focus_actions" (
	"action_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"applied_at" timestamp with time zone NOT NULL,
	"response" json NOT NULL
);
--> statement-breakpoint
CREATE TABLE "focus_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"task_id" uuid,
	"kind" varchar(8) NOT NULL,
	"device_id" varchar(64) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	"planned_seconds" integer,
	"last_seen_at" timestamp with time zone NOT NULL,
	"end_reason" varchar(16)
);
--> statement-breakpoint
ALTER TABLE "focus_actions" ADD CONSTRAINT "focus_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_focus_actions_user_applied" ON "focus_actions" USING btree ("user_id","applied_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_focus_sessions_open_user" ON "focus_sessions" USING btree ("user_id") WHERE "focus_sessions"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "ix_focus_sessions_user_started" ON "focus_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "ix_focus_sessions_task_id" ON "focus_sessions" USING btree ("task_id");