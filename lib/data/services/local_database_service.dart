import 'package:flutter/widgets.dart';
import 'package:permission_handler/permission_handler.dart';
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

    final taskTable = """
      CREATE TABLE IF NOT EXISTS "task" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
        "project_id" INTEGER NOT NULL,
        "name" VARCHAR NOT NULL,
        "description" VARCHAR,
        FOREIGN KEY ("project_id") REFERENCES "project"("id")
        ON UPDATE NO ACTION ON DELETE NO ACTION
      );
    """;

    final projectTable = """
      CREATE TABLE IF NOT EXISTS "project" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
        "due_date" DATETIME,
        "name" VARCHAR NOT NULL,
        "description" VARCHAR
      );
    """;

    final activityTable = """
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

    debugPrint('Abrindo banco de dados: $dbPath');

    _database = await openDatabase(
      dbPath,
      version: AppConstants.localDatabaseVersion,
      onCreate: (db, version) async {
        // Define your table creation logic here
        debugPrint('Banco de dados criado: $dbPath ✅');
        await db.execute(taskTable);
        await db.execute(projectTable);
        await db.execute(activityTable);
        debugPrint('Tabelas criadas com sucesso ✅');
      },
    );

    // await dbExportToDownloadFolder();
  }

  // Add getter for database instance
  Database? get database => _database;

  // Add method to close database
  Future<void> close() async {
    await _database?.close();
    _database = null;
  }

  dbToCopy() async {
    debugPrint('✅ Tentando exportar banco de dados...');

    if (_database == null) {
      throw Exception('Database is not initialized');
    }

    final dbPath = await getDatabasesPath();
    final dbFile = File(join(dbPath, AppConstants.localDatabase));

    if (!await dbFile.exists()) {
      throw Exception('Database file does not exist');
    }

    return dbFile;
  }

  dbExportToDownloadFolder() async {
    File localDatabasePath = await dbToCopy();
    Directory documentsDirectory = Directory("storage/emulated/0/Download/");
    String newPath = join(
      documentsDirectory.absolute.path + AppConstants.localDatabase,
    );

    Map<Permission, PermissionStatus> statuses =
        await [Permission.manageExternalStorage].request();

    bool hasPermission =
        statuses[Permission.manageExternalStorage] == PermissionStatus.granted;

    if (hasPermission) {
      File a = await localDatabasePath.copy(newPath);
      debugPrint('Banco de dados copiado para: ${a.absolute.path} ✅');
    } else {
      debugPrint(
        "Permissões não concedidas para acessar o armazenamento externo.",
      );
    }
  }
}
