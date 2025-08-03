import 'package:copy_with_extension/copy_with_extension.dart';

part 'project.g.dart';

@CopyWith()
class Project {
  final int id;
  final String name;
  final String? description;
  final DateTime? dueDate;
  final DateTime createdAt;
  final DateTime updatedAt;

  Project({
    this.id = 0,
    required this.name,
    this.description,
    this.dueDate,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) : createdAt = createdAt ?? DateTime.now(),
       updatedAt = updatedAt ?? DateTime.now();
}
