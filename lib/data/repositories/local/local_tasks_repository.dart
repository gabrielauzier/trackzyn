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
  Future<void> delete(String taskId) {
    // TODO: implement delete
    throw UnimplementedError();
  }

  @override
  Future<List<Task>> fetchMany({
    String? projectId,
    String? taskName,
    DateTime? startDate,
    DateTime? endDate,
  }) {
    // TODO: implement fetchMany
    throw UnimplementedError();
  }

  @override
  Future<Task?> getById(int taskId) {
    // TODO: implement getById
    throw UnimplementedError();
  }

  @override
  Future<void> update(Task task) {
    // TODO: implement update
    throw UnimplementedError();
  }
}
