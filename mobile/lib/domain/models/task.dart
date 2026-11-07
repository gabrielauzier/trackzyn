import 'package:copy_with_extension/copy_with_extension.dart';

part 'task.g.dart';

/// The series a task is the open occurrence of (D4): the app only reads it, to show the repeat icon.
class TaskSeries {
  final String id;

  /// `daily`, `weekly` or `monthly`.
  final String freq;
  final int interval;

  /// 1 (Monday) to 7 (Sunday), on a weekly rule.
  final List<int>? weekdays;
  final int? monthDay;

  /// The last possible day, `YYYY-MM-DD`.
  final String? until;
  final int? count;

  /// The next day the rule projects, `YYYY-MM-DD`; null once the series ends.
  final String? nextOn;

  const TaskSeries({
    required this.id,
    required this.freq,
    required this.interval,
    this.weekdays,
    this.monthDay,
    this.until,
    this.count,
    this.nextOn,
  });

  factory TaskSeries.fromMap(Map<String, dynamic> map) {
    final rule = (map['rule'] as Map?)?.cast<String, dynamic>() ?? const {};
    return TaskSeries(
      id: map['id'].toString(),
      freq: rule['freq'] as String? ?? 'daily',
      interval: rule['interval'] as int? ?? 1,
      weekdays: (rule['weekdays'] as List?)?.map((day) => day as int).toList(),
      monthDay: rule['month_day'] as int?,
      until: rule['until'] as String?,
      count: rule['count'] as int?,
      nextOn: map['next_on'] as String?,
    );
  }

  @override
  int get hashCode => Object.hash(id, freq, interval, Object.hashAll(weekdays ?? const []), monthDay, until, count, nextOn);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is TaskSeries &&
        other.id == id &&
        other.freq == freq &&
        other.interval == interval &&
        _sameDays(other.weekdays, weekdays) &&
        other.monthDay == monthDay &&
        other.until == until &&
        other.count == count &&
        other.nextOn == nextOn;
  }

  static bool _sameDays(List<int>? a, List<int>? b) {
    if (a == null || b == null) return a == b;
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }
}

@CopyWith()
class Task {
  final int? id;
  final int? projectId;
  final String name;
  String? description;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final DateTime? dueDate;
  final String? tags;
  final String? status;
  final String? priority;

  /// The scheduled day, `YYYY-MM-DD` in the workspace timezone; null when not scheduled (D4).
  final String? scheduledOn;

  /// The start time, `HH:MM`; only with a day.
  final String? scheduledTime;

  /// The series the task belongs to; null for a task that does not repeat.
  final TaskSeries? series;

  // Agreggated fields
  final String? projectName;
  final int? totalDurationInSeconds;

  Task({
    this.id,
    this.projectId,
    required this.name,
    this.description,
    this.createdAt,
    this.updatedAt,
    this.dueDate,
    this.totalDurationInSeconds = 0,
    this.projectName,
    this.tags,
    this.status,
    this.priority,
    this.scheduledOn,
    this.scheduledTime,
    this.series,
  });

  resetDescription() {
    description = null;
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'project_id': projectId,
      'name': name,
      'description': description,
      'created_at': createdAt?.toIso8601String(),
      'due_date': dueDate?.toIso8601String(),
      'tags': tags,
      'status': status,
      'priority': priority,
      // 'updated_at': updatedAt.toIso8601String(),
    };
  }

  factory Task.fromMap(Map<String, dynamic> map) {
    return Task(
      id: map['id'] as int,
      projectId: map['project_id'] as int?,
      name: map['name'] as String,
      description: map['description'] as String?,
      totalDurationInSeconds:
          map['total_duration_seconds'] != null
              ? map['total_duration_seconds'] as int
              : 0,
      createdAt:
          map['created_at'] != null
              ? DateTime.parse(map['created_at'] as String)
              : null,
      dueDate:
          map['due_date'] != null
              ? DateTime.parse(map['due_date'] as String)
              : null,
      status: map['status'] as String?,
      priority: map['priority'] as String?,
      // Absent from older answers: the task is then not scheduled.
      scheduledOn: map['scheduled_on'] as String?,
      scheduledTime: map['scheduled_time'] as String?,
      series:
          map['series'] != null
              ? TaskSeries.fromMap((map['series'] as Map).cast<String, dynamic>())
              : null,
      // tags: map['tags'] as String?,
      // projectName: map['project_name'] as String?,
      // updatedAt: DateTime.parse(map['updated_at'] as String),
    );
  }

  @override
  int get hashCode {
    return id.hashCode ^
        projectId.hashCode ^
        name.hashCode ^
        description.hashCode ^
        createdAt.hashCode ^
        updatedAt.hashCode ^
        dueDate.hashCode ^
        tags.hashCode ^
        status.hashCode ^
        priority.hashCode ^
        projectName.hashCode ^
        totalDurationInSeconds.hashCode ^
        scheduledOn.hashCode ^
        scheduledTime.hashCode ^
        series.hashCode;
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;

    return other is Task &&
        other.id == id &&
        other.projectId == projectId &&
        other.name == name &&
        other.description == description &&
        other.createdAt == createdAt &&
        other.updatedAt == updatedAt &&
        other.dueDate == dueDate &&
        other.tags == tags &&
        other.status == status &&
        other.priority == priority &&
        other.projectName == projectName &&
        other.totalDurationInSeconds == totalDurationInSeconds &&
        other.scheduledOn == scheduledOn &&
        other.scheduledTime == scheduledTime &&
        other.series == series;
  }
}
