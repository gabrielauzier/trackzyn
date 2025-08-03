import 'package:flutter/material.dart';
import 'package:trackzyn/data/repositories/activities_repository.dart';
import 'package:trackzyn/data/repositories/tasks_repository.dart';
import 'package:trackzyn/domain/models/activity.dart';
import 'package:trackzyn/domain/models/task.dart';

class AddActivityUseCase {
  final ActivitiesRepository _activitiesRepository;
  final TasksRepository _tasksRepository;

  AddActivityUseCase(this._activitiesRepository, this._tasksRepository);

  Future<void> execute(Activity activity, {Task? task}) async {
    try {
      if (task != null && task.id != null) {
        Task? foundTask = await _tasksRepository.getById(task.id!);

        if (foundTask == null) {
          int? createdTaskId = await _tasksRepository.add(task);
          activity.taskId = createdTaskId;
        }
      }

      await _activitiesRepository.add(activity);
    } catch (e) {
      debugPrint('Erro ao adicionar atividade: $e');
    }
  }
}
