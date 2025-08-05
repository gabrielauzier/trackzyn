import 'package:flutter/material.dart';

import 'package:trackzyn/data/repositories/activities_repository.dart';
import 'package:trackzyn/domain/models/task_activity_group.dart';

class GetTaskActivityGroupUseCase {
  final ActivitiesRepository _activitiesRepository;

  GetTaskActivityGroupUseCase(ActivitiesRepository activitiesRepository)
    : _activitiesRepository = activitiesRepository;

  Future<List<TaskActivityGroup>> execute() async {
    try {
      return await _activitiesRepository.groupByTaskAndDate();
    } catch (e) {
      debugPrint('Erro ao buscar atividades: $e');
      return [];
    }
  }
}
