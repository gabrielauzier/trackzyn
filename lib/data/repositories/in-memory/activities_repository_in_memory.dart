import 'package:trackzyn/data/repositories/activities_repository.dart';
import 'package:trackzyn/domain/models/activity.dart';

class ActivitiesRepositoryInMemory implements ActivitiesRepository {
  final List<Activity> _activities = [
    // Example activities
    // Activity(
    //   id: 1,
    //   startedAt: DateTime.now().subtract(Duration(hours: 5)),
    //   durationInSeconds: 100,
    // ),
    // Activity(
    //   id: 2,
    //   startedAt: DateTime.now().subtract(Duration(minutes: 30)),
    //   durationInSeconds: 350,
    // ),
  ];

  @override
  Future<List<Activity>> fetchMany({
    int? projectId,
    int? taskId,
    String? taskName,
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    // Simulate fetching activities from memory
    return _activities
        .where((activity) {
          // if (projectId != null && activity.projectId != projectId) return false;
          if (taskId != null && activity.taskId != taskId) return false;
          // if (activityName != null && !activity.name.contains(activityName))
          // return false;
          // if (startDate != null && activity.date.isBefore(startDate)) return false;
          // if (endDate != null && activity.date.isAfter(endDate)) return false;
          return true;
        })
        .toList()
        .reversed
        .toList(); // Return in reverse order
  }

  @override
  Future<Activity> getById(int activityId) async {
    return _activities.firstWhere((activity) => activity.id == activityId);
  }

  @override
  Future<int?> add(Activity activity) async {
    var maxId =
        _activities.isEmpty
            ? 0
            : _activities.map((a) => a.id ?? 0).reduce((a, b) => a > b ? a : b);

    activity.id = (maxId + 1); // Ensure unique ID for the new activity

    _activities.add(activity);
    return activity.id;
  }

  @override
  Future<void> update(Activity activity) async {
    final index = _activities.indexWhere((a) => a.id == activity.id);
    if (index != -1) {
      _activities[index] = activity;
    }
  }

  @override
  Future<void> delete(int activityId) async {
    _activities.removeWhere((activity) => activity.id == activityId);
  }
}
