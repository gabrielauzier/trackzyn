import 'package:flutter/material.dart';

import 'package:trackzyn/data/repositories/tasks_repository.dart';
import 'package:trackzyn/domain/models/task.dart';

class GetOneTaskUseCase {
  final TasksRepository _tasksRepository;

  GetOneTaskUseCase(TasksRepository tasksRepository)
    : _tasksRepository = tasksRepository;

  Future<Task?> execute(int taskId) async {
    try {
      return await _tasksRepository.getById(taskId);
    } catch (e) {
      debugPrint('Erro ao buscar tarefa por ID: $e');
      return null;
    }
  }
}
