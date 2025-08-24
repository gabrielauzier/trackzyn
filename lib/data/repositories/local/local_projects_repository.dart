import 'package:flutter/material.dart';
import 'package:trackzyn/data/repositories/projects_repository.dart';
import 'package:trackzyn/data/services/local_database_service.dart';
import 'package:trackzyn/domain/models/project.dart';

class LocalProjectsRepository implements ProjectsRepository {
  LocalProjectsRepository({required LocalDatabaseService localDatabaseService})
    : _service = localDatabaseService;

  final LocalDatabaseService _service;

  @override
  Future<int?> add(Project project) async {
    final id = await _service.database?.insert('project', project.toMap());
    debugPrint('Projeto criado com ID $id: ${project.toString()}');
    return id;
  }

  @override
  Future<void> delete(int projectId) {
    // TODO: implement delete
    throw UnimplementedError();
  }

  @override
  Future<List<Project>> fetchMany({
    String? projectName,
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    if (_service.database == null) {
      debugPrint('LocalProjectsRepository - Database is not initialized');

      while (_service.database == null) {
        await Future.delayed(const Duration(milliseconds: 100));
        debugPrint('Waiting for database to be initialized...');
      }
    }

    final List<Map<String, Object?>> results = await _service.database!.query(
      'project',
      where: projectName != null ? 'name LIKE ?' : null,
      whereArgs: projectName != null ? ['%$projectName%'] : null,
    );

    return results.map((map) => Project.fromMap(map)).toList();
  }

  @override
  Future<Project> getById(String projectId) {
    // TODO: implement getById
    throw UnimplementedError();
  }

  @override
  Future<void> update(Project project) {
    // TODO: implement update
    throw UnimplementedError();
  }
}
