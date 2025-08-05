import 'package:flutter/cupertino.dart';
import 'package:trackzyn/data/repositories/activities_repository.dart';
import 'package:trackzyn/data/services/local_database_service.dart';
import 'package:trackzyn/domain/models/activity.dart';
import 'package:trackzyn/domain/models/task_activity_group.dart';

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
    String? taskName,
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    if (_service.database == null) {
      debugPrint('Database is not initialized');
      return [];
    }

    final List<Map<String, Object?>> maps = await _service.database!.rawQuery(
      '''
          SELECT activity.*, task.name as task_name, project.name as project_name FROM activity
          LEFT JOIN task ON activity.task_id IS NOT NULL AND activity.task_id = task.id 
          LEFT JOIN project ON task.project_id IS NOT NULL AND task.project_id = project.id
          ORDER BY id DESC
          ''',
    );

    return maps
        .map((row) {
          try {
            return Activity.fromMap(row);
          } catch (e) {
            debugPrint('Erro mapeando atividades: $e');
            return null;
          }
        })
        .where((activity) => activity != null)
        .cast<Activity>()
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

  @override
  Future<List<TaskActivityGroup>> groupByTaskAndDate() async {
    if (_service.database == null) {
      debugPrint('Database is not initialized');
      return [];
    }

    final List<Map<String, Object?>> maps = await _service.database!.rawQuery(
      '''
          SELECT
              t.name as task_name,
              p.name as project_name,
              DATE(started_at) as activity_date,
              MAX(a.started_at) as started_at,
              COUNT(a.id) as activity_count,
              GROUP_CONCAT(a.id) as activity_ids,
              SUM(duration_in_seconds) as total_duration_seconds,
              TIME(SUM(duration_in_seconds), 'unixepoch') as total_time
          FROM activity a
              LEFT JOIN task t ON t.Id = a.task_id
              LEFT JOIN project p ON p.Id = t.project_id
          GROUP BY t.name, p.name, DATE(started_at)
          ORDER BY started_at DESC;
      ''',
    );

    return maps
        .map((row) {
          try {
            return TaskActivityGroup.fromMap(row);
          } catch (e) {
            debugPrint('Erro mapeando atividades x tarefas: $e');
            return null;
          }
        })
        .where((row) => row != null)
        .cast<TaskActivityGroup>()
        .toList();
  }
}
