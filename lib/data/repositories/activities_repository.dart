import 'package:trackzyn/domain/models/activity.dart';
import 'package:trackzyn/domain/models/task_activity_group.dart';

abstract class ActivitiesRepository {
  Future<List<Activity>> fetchMany({
    int? projectId,
    int? taskId,
    String? taskName,
    String? startDate,
    String? endDate,
    bool? enableSearchTaskNull = false,
  });

  Future<Activity> getById(int activityId);

  Future<int?> add(Activity activity);

  Future<void> update(Activity activity);

  Future<void> delete(int activityId);

  Future<List<TaskActivityGroup>> groupByTaskAndDate({String? taskName});
}
