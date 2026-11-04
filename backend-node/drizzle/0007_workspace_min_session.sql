-- #22: sessions shorter than this many minutes are hidden in the agenda and the Sessions report; null shows all.
ALTER TABLE "workspaces" ADD COLUMN "min_session_minutes" smallint;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "ck_workspaces_min_session_minutes" CHECK ("workspaces"."min_session_minutes" BETWEEN 1 AND 60);
