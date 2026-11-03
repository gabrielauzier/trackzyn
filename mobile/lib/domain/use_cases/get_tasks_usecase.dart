import 'package:flutter/material.dart';

import 'package:trackzyn/data/repositories/tasks_repository.dart';
import 'package:trackzyn/domain/models/task.dart';

class GetTasksUseCase {
  final TasksRepository _tasksRepository;

  GetTasksUseCase(TasksRepository tasksRepository)
    : _tasksRepository = tasksRepository;

  Future<List<Task>> execute(int? projectId) async {
    try {
      return await _tasksRepository.fetchMany(projectId: projectId);
    } catch (e) {
      debugPrint('Erro ao buscar tarefas: $e');
      return [];
    }
  }
}
