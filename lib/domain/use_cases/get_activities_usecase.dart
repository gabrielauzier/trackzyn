import 'package:flutter/material.dart';
import 'package:trackzyn/data/repositories/activities_repository.dart';
import 'package:trackzyn/domain/models/activity.dart';

class GetActivitiesUseCase {
  final ActivitiesRepository _activitiesRepository;

  GetActivitiesUseCase(ActivitiesRepository activitiesRepository)
    : _activitiesRepository = activitiesRepository;

  Future<List<Activity>> execute() async {
    try {
      return await _activitiesRepository.fetchMany();
    } catch (e) {
      debugPrint('Erro ao buscar atividades: $e');
      return [];
    }
  }
}
