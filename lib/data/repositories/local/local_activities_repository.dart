import 'package:flutter/cupertino.dart';
import 'package:trackzyn/data/repositories/activities_repository.dart';
import 'package:trackzyn/data/services/local_database_service.dart';
import 'package:trackzyn/domain/models/activity.dart';

class LocalActivitiesRepository implements ActivitiesRepository {
  LocalActivitiesRepository({
    required LocalDatabaseService localDatabaseService,
  }) : _service = localDatabaseService;

  final LocalDatabaseService _service;

  @override
  Future<int?> add(Activity activity) async {
    final id = await _service.database?.insert('activity', activity.toMap());
    debugPrint('Atividade criada com ID $id: ${activity.toString()}');
    return id;
  }

  @override
  Future<void> delete(int activityId) {
    // TODO: implement delete
    throw UnimplementedError();
  }

  @override
  Future<List<Activity>> fetchMany({
    int? projectId,
    int? taskId,
    String? activityName,
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    final List<Map<String, Object?>> activityMaps = await _service.database!
        .query('activity');

    return activityMaps
        .map((activityMap) => Activity.fromMap(activityMap))
        .toList();
  }

  @override
  Future<Activity> getById(int activityId) {
    // TODO: implement getById
    throw UnimplementedError();
  }

  @override
  Future<void> update(Activity activity) {
    // TODO: implement update
    throw UnimplementedError();
  }
}
