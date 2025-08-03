class Activity {
  int _id;
  int? _taskId;
  final String? note;
  final DateTime startedAt;
  final int durationInSeconds;

  Activity({
    int id = 0,
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

  int get id => _id;
  set id(int value) {
    _id = value;
  }
}
