import 'package:flutter/material.dart';

import 'package:trackzyn/data/repositories/activities_repository.dart';
import 'package:trackzyn/domain/models/task_activity_group.dart';

class GetTaskActivityGroupUseCase {
  final ActivitiesRepository _activitiesRepository;

  GetTaskActivityGroupUseCase(ActivitiesRepository activitiesRepository)
    : _activitiesRepository = activitiesRepository;

  Future<List<TaskActivityGroup>> execute({String? taskName}) async {
    try {
      return await _activitiesRepository.groupByTaskAndDate(taskName: taskName);
    } catch (e) {
      debugPrint('Erro ao buscar atividades: $e');
      return [];
    }
  }
}
