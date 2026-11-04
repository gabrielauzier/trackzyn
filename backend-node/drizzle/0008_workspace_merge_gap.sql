-- #23: sessions of one list and kind this many minutes apart or less are drawn as one block in the agenda; null keeps them apart.
ALTER TABLE "workspaces" ADD COLUMN "merge_gap_minutes" smallint;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "ck_workspaces_merge_gap_minutes" CHECK ("workspaces"."merge_gap_minutes" BETWEEN 1 AND 60);
