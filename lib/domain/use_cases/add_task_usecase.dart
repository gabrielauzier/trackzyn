import 'package:flutter/material.dart';
import 'package:trackzyn/data/repositories/tasks_repository.dart';
import 'package:trackzyn/domain/models/task.dart';

class AddTaskUseCase {
  final TasksRepository _tasksRepository;

  AddTaskUseCase(TasksRepository tasksRepository)
    : _tasksRepository = tasksRepository;

  Future<int?> execute(Task task) async {
    try {
      return await _tasksRepository.add(task);
    } catch (e) {
      debugPrint('Erro ao adicionar tarefa: $e');
      return null;
    }
  }
}
