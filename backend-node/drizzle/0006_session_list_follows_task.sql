-- #21: a task session counts for the list its task is in; sessions of tasks moved before the fix still point at the old list.
UPDATE "focus_sessions" AS fs SET "list_id" = t."list_id" FROM "tasks" AS t WHERE fs."task_id" = t."id" AND fs."list_id" <> t."list_id";
