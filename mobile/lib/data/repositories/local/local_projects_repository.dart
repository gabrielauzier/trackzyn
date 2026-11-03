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
    await _waitForDatabaseInitialization();

    final List<Map<String, Object?>> results = await _service.database!
        .rawQuery('''
      SELECT 
        p.id,
        p.name,
        p.description,
        p.due_date,
        COUNT(t.id) AS task_count
      FROM project p
        LEFT JOIN task t ON t.project_id = p.id
      ${projectName != null ? 'WHERE name LIKE ?' : ''}
      GROUP BY 
        p.id,
        p.name,
        p.description,
        p.due_date
      ORDER BY p.id DESC
      ''', projectName != null ? ['%$projectName%'] : null);

    return results.map((map) => Project.fromMap(map)).toList();
  }

  @override
  Future<Project?> getById(int projectId) async {
    await _waitForDatabaseInitialization();

    final List<Map<String, Object?>> results = await _service.database!.query(
      'project',
      where: 'id = ?',
      whereArgs: [projectId],
    );

    if (results.isNotEmpty) {
      return Project.fromMap(results.first);
    } else {
      return null;
    }
  }

  @override
  Future<void> update(Project project) {
    // TODO: implement update
    throw UnimplementedError();
  }

  _waitForDatabaseInitialization() async {
    while (_service.database == null) {
      await Future.delayed(const Duration(milliseconds: 100));
      debugPrint('Waiting for database to be initialized...');
    }
  }
}
