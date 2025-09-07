class Task {
  final int? id;
  final int? projectId;
  final String name;
  final String? description;
  final DateTime createdAt;
  final DateTime updatedAt;

  final int? totalDurationInSeconds;

  Task({
    this.id,
    this.projectId,
    required this.name,
    this.description,
    DateTime? createdAt,
    DateTime? updatedAt,
    this.totalDurationInSeconds = 0,
  }) : createdAt = createdAt ?? DateTime.now(),
       updatedAt = updatedAt ?? DateTime.now();

  // Additional methods like toJson, fromJson, etc. can be added here.

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'project_id': projectId,
      'name': name,
      'description': description,
      // 'created_at': createdAt.toIso8601String(),
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
      // createdAt: DateTime.parse(map['created_at'] as String),
      // updatedAt: DateTime.parse(map['updated_at'] as String),
    );
  }
}
