import 'package:flutter/material.dart';
import 'package:trackzyn/data/repositories/activities_repository.dart';
import 'package:trackzyn/domain/models/activity.dart';
import 'package:trackzyn/ui/utils/get_date_truncate.dart';

class GetActivitiesUseCase {
  final ActivitiesRepository _activitiesRepository;

  GetActivitiesUseCase(ActivitiesRepository activitiesRepository)
    : _activitiesRepository = activitiesRepository;

  Future<List<Activity>> execute({
    int? taskId,
    int? projectId,
    String? date,
    bool searchAll = false,
  }) async {
    try {
      // Format YYYY-MM-DD
      final startDate = date;

      // Format YYYY-MM-DD
      final endDate =
          startDate != null
              ? getDateTruncate(
                DateTime.parse(startDate).add(const Duration(days: 1)),
              )
              : null;

      return await _activitiesRepository.fetchMany(
        taskId: taskId,
        projectId: projectId,
        startDate: startDate,
        endDate: endDate,
        searchAll: searchAll,
      );
    } catch (e) {
      debugPrint('Erro ao buscar atividades por tarefa e data: $e');
      return [];
    }
  }
}
