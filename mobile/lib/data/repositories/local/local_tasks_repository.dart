import 'package:flutter/material.dart';

import 'package:trackzyn/data/repositories/tasks_repository.dart';
import 'package:trackzyn/data/services/local_database_service.dart';
import 'package:trackzyn/domain/models/task.dart';

class LocalTasksRepository implements TasksRepository {
  LocalTasksRepository({required LocalDatabaseService localDatabaseService})
    : _service = localDatabaseService;

  final LocalDatabaseService _service;

  @override
  Future<int?> add(Task task) async {
    final id = await _service.database?.insert('task', task.toMap());
    debugPrint('✅ Tarefa criada ID $id: ${task.toString()}');
    return id;
  }

  @override
  Future<void> delete(int taskId) {
    // TODO: implement delete
    throw UnimplementedError();
  }

  @override
  Future<List<Task>> fetchMany({
    int? projectId,
    String? taskName,
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    final List<Map<String, Object?>> taskMaps = await _service.database!
        .rawQuery(
          '''
          SELECT
            t.id,
            t.project_id,
            t.name,
            t.description,
            SUM(a.duration_in_seconds) as total_duration_seconds
          FROM task t
            LEFT JOIN activity a ON t.id = a.task_id
          WHERE t.project_id = ?
          GROUP BY t.id, t.project_id, t.name, t.description
          ORDER BY t.id DESC
          ''',
          [projectId],
        );

    return taskMaps
        .map((activityMap) {
          try {
            return Task.fromMap(activityMap);
          } catch (e) {
            debugPrint('Error mapping task: $e');
            return null;
          }
        })
        .where((activity) => activity != null)
        .cast<Task>()
        .toList();
  }

  @override
  Future<Task?> getById(int taskId) async {
    final taskMap = await _service.database!.query(
      'task',
      where: 'id = ?',
      whereArgs: [taskId],
    );

    if (taskMap.isNotEmpty) {
      return Task.fromMap(taskMap.first);
    }

    return null;
  }

  @override
  Future<void> update(Task task) async {
    await _service.database!.update(
      'task',
      task.toMap(),
      where: 'id = ?',
      whereArgs: [task.id],
    );
  }
}
