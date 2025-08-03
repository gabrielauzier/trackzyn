import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:sqflite/sqflite.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:path/path.dart';
import 'package:trackzyn/app/constants.dart';
import 'dart:io';

class LocalDatabaseService {
  static Database? _database;

  Future<void> init() async {
    // Initialize database factory for desktop platforms
    if (Platform.isWindows || Platform.isLinux || Platform.isMacOS) {
      // Initialize FFI
      sqfliteFfiInit();
      // Change the default factory
      databaseFactory = databaseFactoryFfi;
    }

    final path = await getDatabasesPath();
    final dbPath = join(path, AppConstants.localDatabase);

    final createTablesSQL = """
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
    """;

    _database = await openDatabase(
      dbPath,
      version: AppConstants.localDatabaseVersion,
      onCreate: (db, version) async {
        // Define your table creation logic here
        debugPrint('Banco de dados criado: $dbPath ✅');
        await db.execute(createTablesSQL);
        debugPrint('Tabelas criadas com sucesso ✅');
      },
    );
  }

  // Add getter for database instance
  Database? get database => _database;

  // Add method to close database
  Future<void> close() async {
    await _database?.close();
    _database = null;
  }
}
