import 'package:copy_with_extension/copy_with_extension.dart';
import 'package:trackzyn/domain/enums/viewmodel_status.dart';
import 'package:trackzyn/domain/models/project.dart';
import 'package:trackzyn/domain/models/task.dart';

part 'task_detail_state.g.dart';

@CopyWith()
class TaskDetailState {
  final Task? task;
  final Task? originalTask;
  final List<Project> projects;
  final ViewModelStatus status;
  final String? errorMessage;

  TaskDetailState({
    this.task,
    this.originalTask,
    this.projects = const [],
    this.status = ViewModelStatus.initial,
    this.errorMessage,
  });
}
