class Activity {
  int? _id;
  int? _taskId;
  final String? note;
  final DateTime startedAt;
  final int durationInSeconds;

  Activity({
    int? id,
    int? taskId,
    this.note,
    DateTime? startedAt,
    this.durationInSeconds = 0,
  }) : _id = id,
       _taskId = taskId,
       startedAt = startedAt ?? DateTime.now();

  int? get taskId => _taskId;
  set taskId(int? value) {
    _taskId = value;
  }

  int? get id => _id;
  set id(int? value) {
    _id = value;
  }

  factory Activity.fromMap(Map<String, dynamic> map) {
    return Activity(
      id: map['id'] as int,
      taskId: map['task_id'] as int?,
      note: map['note'] as String?,
      startedAt: DateTime.parse(map['started_at'] as String),
      durationInSeconds: map['duration_in_seconds'] as int,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': _id,
      'task_id': _taskId,
      'note': note,
      'started_at': startedAt.toIso8601String(),
      'duration_in_seconds': durationInSeconds,
    };
  }

  @override
  String toString() {
    return 'Activity(id: $_id, taskId: $_taskId, note: $note, startedAt: $startedAt, durationInSeconds: $durationInSeconds)';
  }
}
