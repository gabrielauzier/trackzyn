import 'package:trackzyn/domain/models/activity.dart';

abstract class ActivitiesRepository {
  Future<List<Activity>> fetchMany({
    int? projectId,
    int? taskId,
    String? activityName,
    DateTime? startDate,
    DateTime? endDate,
  });

  Future<Activity> getById(int activityId);

  Future<int?> add(Activity activity);

  Future<void> update(Activity activity);

  Future<void> delete(int activityId);
}
