// ignore_for_file: non_constant_identifier_names

class DatabaseScripts {
  static const List<String> scripts_v1_2025_08_01 = [
    """
      CREATE TABLE IF NOT EXISTS "task" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
        "project_id" INTEGER NOT NULL,
        "name" VARCHAR NOT NULL,
        "description" VARCHAR,
        FOREIGN KEY ("project_id") REFERENCES "project"("id")
        ON UPDATE NO ACTION ON DELETE NO ACTION
      );
    """,

    """
      CREATE TABLE IF NOT EXISTS "project" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
        "due_date" DATETIME,
        "name" VARCHAR NOT NULL,
        "description" VARCHAR
      );
    """,

    """
      CREATE TABLE IF NOT EXISTS "activity" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
        "task_id" INTEGER,
        "note" VARCHAR,
        "started_at" DATETIME NOT NULL,
        "duration_in_seconds" INTEGER NOT NULL,
        FOREIGN KEY ("task_id") REFERENCES "task"("id")
        ON UPDATE NO ACTION ON DELETE NO ACTION
      );
    """,
  ];

  ///****************************************************************************
  /// SCRIPTS V2 - 23/08/2025
  ///****************************************************************************

  static const List<String> scripts_v2_2025_08_23 = [
    """
      ALTER TABLE "activity" ADD COLUMN "project_id" INTEGER;
    """,

    """
      ALTER TABLE "activity" ADD COLUMN "finished_at" DATETIME;
    """,

    // SQLite does not support adding a foreign key constraint with ALTER TABLE.
    // Instead, create a new table with the desired schema, copy the data, and replace the old table.
    """
      PRAGMA foreign_keys=off;
    """,

    """
      CREATE TABLE "activity_new" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
        "task_id" INTEGER,
        "note" VARCHAR,
        "started_at" DATETIME NOT NULL,
        "duration_in_seconds" INTEGER NOT NULL,
        "project_id" INTEGER,
        "finished_at" DATETIME,
        FOREIGN KEY ("task_id") REFERENCES "task"("id")
        ON UPDATE NO ACTION ON DELETE NO ACTION,
        FOREIGN KEY ("project_id") REFERENCES "project"("id")
        ON UPDATE NO ACTION ON DELETE NO ACTION
      );
    """,

    """
      INSERT INTO "activity_new" ("id", "task_id", "note", "started_at", "duration_in_seconds", "project_id", "finished_at")
      SELECT "id", "task_id", "note", "started_at", "duration_in_seconds", NULL, NULL
      FROM "activity";
    """,

    """
      DROP TABLE "activity";
    """,

    """
      ALTER TABLE "activity_new" RENAME TO "activity";
    """,

    """
      PRAGMA foreign_keys=on;
    """,
  ];
}
