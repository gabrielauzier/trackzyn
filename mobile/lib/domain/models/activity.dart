// ignore_for_file: unnecessary_getters_setters

import 'package:trackzyn/ui/utils/get_total_time_str.dart';

class Activity {
  int? _id;
  int? _taskId;
  int? _projectId;
  final String? note;
  final DateTime startedAt;
  final DateTime? finishedAt;
  final int durationInSeconds;

  final String? taskName;
  final String? projectName;

  Activity({
    int? id,
    int? taskId,
    int? projectId,
    this.note,
    DateTime? startedAt,
    this.finishedAt,
    this.durationInSeconds = 0,
    this.taskName,
    this.projectName,
  }) : _id = id,
       _taskId = taskId,
       _projectId = projectId,
       startedAt = startedAt ?? DateTime.now();

  int? get taskId => _taskId;
  set taskId(int? value) {
    _taskId = value;
  }

  int? get id => _id;
  set id(int? value) {
    _id = value;
  }

  int? get projectId => _projectId;
  set projectId(int? value) {
    _projectId = value;
  }

  get timeStr => getTotalTimeStr(durationInSeconds, showSeconds: true);

  factory Activity.fromMap(Map<String, dynamic> map) {
    return Activity(
      id: map['id'] ?? 0,
      taskId: map['task_id'] as int?,
      projectId: map['project_id'] as int?,
      note: map['note'] as String?,
      startedAt: DateTime.parse(map['started_at'] as String),
      finishedAt:
          map['finished_at'] != null
              ? DateTime.parse(map['finished_at'] as String)
              : null,
      durationInSeconds: map['duration_in_seconds'] ?? 0,
      taskName: map['task_name'] as String?,
      projectName: map['project_name'] as String?,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': _id,
      'task_id': _taskId,
      'project_id': _projectId,
      'note': note,
      'started_at': startedAt.toIso8601String(),
      'finished_at': finishedAt?.toIso8601String(),
      'duration_in_seconds': durationInSeconds,
    };
  }

  @override
  String toString() {
    return 'Activity(id: $_id, taskId: $_taskId, note: $note, startedAt: $startedAt, durationInSeconds: $durationInSeconds)';
  }
}
