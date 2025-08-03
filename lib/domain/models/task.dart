class Task {
  final int id;
  final int? projectId;
  final String name;
  final String? description;
  final DateTime createdAt;
  final DateTime updatedAt;

  Task({
    this.id = 0,
    this.projectId,
    required this.name,
    this.description,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) : createdAt = createdAt ?? DateTime.now(),
       updatedAt = updatedAt ?? DateTime.now();

  // Additional methods like toJson, fromJson, etc. can be added here.
}
