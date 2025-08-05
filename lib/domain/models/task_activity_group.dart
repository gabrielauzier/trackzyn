import 'package:trackzyn/domain/models/activity.dart';

class TaskActivityGroup {
  // mapped fields
  final String? taskName;
  final String? projectName;
  final String activityDate; // formatted as 'YYYY-MM-DD'
  final int activityCount;
  final int totalDurationInSeconds;
  final String? totalTime;
  final String? startedAt;

  // non mapped fields
  final List<Activity> activities;

  TaskActivityGroup({
    this.taskName,
    this.projectName,
    required this.activityDate,
    required this.activityCount,
    required this.totalDurationInSeconds,
    this.totalTime,
    this.startedAt,
    this.activities = const [],
  });

  factory TaskActivityGroup.fromMap(Map<String, dynamic> map) {
    return TaskActivityGroup(
      taskName: map['task_name'],
      projectName: map['project_name'],
      activityDate: map['activity_date'],
      activityCount: map['activity_count'],
      totalDurationInSeconds: map['total_duration_seconds'],
      totalTime: map['total_time'],
      startedAt: map['started_at'],
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'task_name': taskName,
      'project_name': projectName,
      'activity_date': activityDate,
      'activity_count': activityCount,
      'total_duration_seconds': totalDurationInSeconds,
      'total_time': totalTime,
      'started_at': startedAt,
    };
  }
}
