CREATE TABLE IF NOT EXISTS "task" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    "project_id" INTEGER NOT NULL,
    "name" VARCHAR NOT NULL,
    "description" VARCHAR,
    FOREIGN KEY ("project_id") REFERENCES "project"("id")
    ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE TABLE IF NOT EXISTS "project" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    "due_date" DATETIME,
    "name" VARCHAR NOT NULL,
    "description" VARCHAR
    );

    CREATE TABLE IF NOT EXISTS "activity" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    "task_id" INTEGER,
    "note" VARCHAR,
    "started_at" DATETIME NOT NULL,
    "duration_in_seconds" INTEGER NOT NULL,
    FOREIGN KEY ("task_id") REFERENCES "task"("id")
    ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    INSERT INTO "project" ("id", "due_date", "name", "description") VALUES
    (1, '2023-12-31 23:59:59', 'Project Alpha', 'Description for Project Alpha'),
    (2, '2024-06-30 23:59:59', 'Project Beta', 'Description for Project Beta');

    INSERT INTO "task" ("id", "project_id", "name", "description") VALUES
    (1, 1, 'Task 1', 'Description for Task 1'),
    (2, 1, 'Task 2', 'Description for Task 2'),
    (3, 2, 'Task 3', 'Description for Task 3');

    INSERT INTO "activity" ("id", "task_id", "note", "started_at", "duration_in_seconds") VALUES
    (1, 1, 'Initial work on Task 1', '2023-10-01 09:00:00', 3600),
    (2, 2, 'Continued work on Task 2', '2023-10-02 10:00:00', 5400),
    (3, 3, 'Started Task 3', '2023-10-03 11:00:00', 7200);

    SELECT
      DATE(started_at) as activity_date,
      GROUP_CONCAT(DISTINCT note) as notes,
      COUNT(*) as activity_count,
      GROUP_CONCAT(DISTINCT t.name) as tasks,
      SUM(duration_in_seconds) as total_duration_seconds,
      TIME(SUM(duration_in_seconds), 'unixepoch') as total_time_formatted,
      ROUND(CAST(SUM(duration_in_seconds) AS FLOAT) / 3600, 2) as total_hours,
      (SUM(duration_in_seconds) % 3600) / 60 as total_minutes
    FROM activity a
      LEFT JOIN task t ON t.Id = a.task_id
      LEFT JOIN project p ON p.Id = t.project_id
    GROUP BY DATE(started_at)
    ORDER BY activity_date DESC;

    SELECT
    DATE(started_at) as activity_date,
    GROUP_CONCAT(DISTINCT note) as notes,
    COUNT(*) as activity_count,
    GROUP_CONCAT(DISTINCT t.name) as tasks,
    ROUND(CAST(SUM(duration_in_seconds) AS FLOAT) / 3600, 2) as total_hours
    FROM activity a
    LEFT JOIN task t ON t.Id = a.task_id
    LEFT JOIN project p ON p.Id = t.project_id
    GROUP BY DATE(started_at)
    ORDER BY activity_date DESC;