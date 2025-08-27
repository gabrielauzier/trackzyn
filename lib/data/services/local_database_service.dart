// ignore_for_file: non_constant_identifier_names

import 'package:flutter/widgets.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:path/path.dart';
import 'package:trackzyn/app/constants.dart';
import 'dart:io';

import 'package:trackzyn/data/services/database_scripts.dart';

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

    debugPrint('Abrindo banco de dados: $dbPath');

    _database = await openDatabase(
      dbPath,
      version: AppConstants.localDatabaseVersion,
      onCreate: (db, version) async {
        debugPrint('Banco de dados criado: $dbPath ✅');

        for (var script in DatabaseScripts.scripts_v1_2025_08_01) {
          await db.execute(script);
        }

        for (var script in DatabaseScripts.scripts_v2_2025_08_23) {
          await db.execute(script);
        }

        // Verify if tables were created
        final tables = await db.rawQuery(
          "SELECT name FROM sqlite_master WHERE type='table';",
        );

        debugPrint('Tabelas criadas: ${tables.map((e) => e['name']).toList()}');

        // Verify columns of each table
        for (var table in tables) {
          final tableName = table['name'] as String;
          final columns = await db.rawQuery("PRAGMA table_info($tableName);");
          debugPrint(
            'Colunas da tabela $tableName: ${columns.map((e) => e['name']).toList()}',
          );
        }

        debugPrint('Scripts executados com sucesso ✅');
      },
      onUpgrade: (db, oldVersion, newVersion) async {
        debugPrint(
          'Atualizando banco de dados de versão $oldVersion para $newVersion',
        );

        if (oldVersion < 2) {
          for (var script in DatabaseScripts.scripts_v2_2025_08_23) {
            await db.execute(script);
          }
          debugPrint('Banco de dados atualizado para a versão 2 ✅');
        }
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
