import 'package:trackzyn/domain/models/task.dart';

abstract class TasksRepository {
  Future<List<Task>> fetchMany({
    int? projectId,
    String? taskName,
    DateTime? startDate,
    DateTime? endDate,
  });

  Future<Task?> getById(int taskId);

  Future<int?> add(Task task);

  Future<void> update(Task task);

  Future<void> delete(int taskId);
}
