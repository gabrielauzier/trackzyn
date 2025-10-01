import 'package:copy_with_extension/copy_with_extension.dart';

part 'task.g.dart';

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
        totalDurationInSeconds.hashCode;
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
        other.totalDurationInSeconds == totalDurationInSeconds;
  }
}
