import 'package:copy_with_extension/copy_with_extension.dart';
import 'package:trackzyn/domain/enums/viewmodel_status.dart';

import 'package:trackzyn/domain/models/project.dart';
import 'package:trackzyn/domain/models/task.dart';

part 'detail_project_state.g.dart';

@CopyWith()
class DetailProjectState {
  final Project? project;
  final List<Task> tasks;

  final ViewModelStatus status;

  const DetailProjectState({
    this.project,
    this.tasks = const [],
    this.status = ViewModelStatus.initial,
  });
}
