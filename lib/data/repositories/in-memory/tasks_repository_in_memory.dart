import 'package:trackzyn/data/repositories/tasks_repository.dart';
import 'package:trackzyn/domain/models/task.dart';

class TasksRepositoryInMemory implements TasksRepository {
  final List<Task> _tasks = [];

  @override
  Future<List<Task>> fetchMany({
    String? projectId,
    String? taskName,
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    // Simulate fetching tasks from memory
    return _tasks.where((task) {
      if (projectId != null && task.projectId != projectId) return false;
      if (taskName != null && !task.name.contains(taskName)) return false;
      // if (startDate != null && task.date.isBefore(startDate)) return false;
      // if (endDate != null && task.date.isAfter(endDate)) return false;
      return true;
    }).toList();
  }

  @override
  Future<Task> getById(int taskId) async {
    return _tasks.firstWhere((task) => task.id == taskId);
  }

  @override
  Future<int> add(Task task) async {
    _tasks.add(task);
    return task.id; // Assuming task.id is set when the task is created
  }

  @override
  Future<void> update(Task task) async {
    final index = _tasks.indexWhere((t) => t.id == task.id);
    if (index != -1) {
      _tasks[index] = task;
    }
  }

  @override
  Future<void> delete(String taskId) async {
    _tasks.removeWhere((task) => task.id == taskId);
  }
}
