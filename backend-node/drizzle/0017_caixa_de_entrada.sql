-- caixa-de-entrada: the inbox items, the task groups of a list, the card fields a user hides, and priority, due day, waiting, flag, kind and group on tasks.
CREATE TABLE "inbox_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"text" varchar(500) NOT NULL,
	"source" varchar(8) NOT NULL,
	"created_via_token_id" uuid,
	"list_id" uuid,
	"estimate_minutes" integer,
	"draft" json,
	"discarded_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ck_inbox_items_text" CHECK (char_length(btrim("inbox_items"."text")) BETWEEN 1 AND 500),
	CONSTRAINT "ck_inbox_items_source" CHECK ("inbox_items"."source" IN ('app', 'desktop', 'mcp', 'api')),
	CONSTRAINT "ck_inbox_items_estimate_minutes" CHECK ("inbox_items"."estimate_minutes" BETWEEN 1 AND 1440)
);
--> statement-breakpoint
CREATE TABLE "list_card_fields" (
	"user_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"hidden" json NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "list_card_fields_user_id_list_id_pk" PRIMARY KEY("user_id","list_id")
);
--> statement-breakpoint
CREATE TABLE "task_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"list_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"notes" text,
	"priority" varchar(6) DEFAULT 'none' NOT NULL,
	"due_on" date,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ck_task_groups_priority" CHECK ("task_groups"."priority" IN ('none', 'low', 'medium', 'high', 'ultra')),
	CONSTRAINT "ck_task_groups_notes" CHECK ("task_groups"."notes" IS NULL OR char_length("task_groups"."notes") <= 10000)
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "kind" varchar(8) DEFAULT 'task' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "priority" varchar(6) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "due_on" date;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "waiting" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "waiting_for" varchar(100);--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "flagged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "flag_reason" varchar(200);--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_created_via_token_id_personal_access_tokens_id_fk" FOREIGN KEY ("created_via_token_id") REFERENCES "public"."personal_access_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_card_fields" ADD CONSTRAINT "list_card_fields_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_card_fields" ADD CONSTRAINT "list_card_fields_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_groups" ADD CONSTRAINT "task_groups_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_inbox_items_owner" ON "inbox_items" USING btree ("user_id","workspace_id","discarded_at","created_at");--> statement-breakpoint
CREATE INDEX "ix_list_card_fields_list" ON "list_card_fields" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "ix_task_groups_list" ON "task_groups" USING btree ("list_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_group_id_task_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."task_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_tasks_group" ON "tasks" USING btree ("group_id") WHERE "tasks"."group_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "ck_tasks_kind" CHECK ("tasks"."kind" IN ('task', 'reminder'));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "ck_tasks_priority" CHECK ("tasks"."priority" IN ('none', 'low', 'medium', 'high', 'ultra'));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "ck_tasks_reminder_estimate" CHECK ("tasks"."kind" = 'task' OR "tasks"."estimate_minutes" IS NULL);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "ck_tasks_waiting_for" CHECK ("tasks"."waiting" OR "tasks"."waiting_for" IS NULL);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "ck_tasks_flag_reason" CHECK ("tasks"."flagged" OR "tasks"."flag_reason" IS NULL);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "ck_tasks_flag_done" CHECK ("tasks"."column" <> 'done' OR NOT "tasks"."flagged");