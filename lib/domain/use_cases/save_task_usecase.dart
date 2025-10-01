import 'package:flutter/material.dart';

import 'package:trackzyn/data/repositories/tasks_repository.dart';
import 'package:trackzyn/domain/models/task.dart';

class SaveTaskUseCase {
  final TasksRepository _tasksRepository;

  SaveTaskUseCase(TasksRepository tasksRepository)
    : _tasksRepository = tasksRepository;

  Future<bool> execute(Task task) async {
    try {
      await _tasksRepository.update(task);
      return true;
    } catch (e) {
      debugPrint('Erro ao salvar tarefa: $e');
      return false;
    }
  }
}
