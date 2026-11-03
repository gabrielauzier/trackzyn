import 'package:copy_with_extension/copy_with_extension.dart';

part 'project.g.dart';

@CopyWith()
class Project {
  final int? id;
  final String name;
  final String? description;
  final DateTime? dueDate;
  final DateTime createdAt;
  final DateTime updatedAt;

  final int? taskCount;

  Project({
    this.id,
    required this.name,
    this.description,
    this.dueDate,
    DateTime? createdAt,
    DateTime? updatedAt,
    this.taskCount,
  }) : createdAt = createdAt ?? DateTime.now(),
       updatedAt = updatedAt ?? DateTime.now();

  factory Project.fromMap(Map<String, dynamic> map) {
    return Project(
      id: map['id'] as int? ?? 0,
      name: map['name'] as String,
      description: map['description'] as String?,
      dueDate: map['due_date'] != null ? DateTime.parse(map['due_date']) : null,
      taskCount: map['task_count'] as int? ?? 0,
      // createdAt: DateTime.parse(map['created_at']),
      // updatedAt: DateTime.parse(map['updated_at']),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'description': description,
      'due_date': dueDate?.toIso8601String(),
      // 'created_at': createdAt.toIso8601String(),
      // 'updated_at': updatedAt.toIso8601String(),
    };
  }
}
