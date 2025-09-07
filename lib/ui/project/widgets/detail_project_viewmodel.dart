import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:trackzyn/domain/enums/viewmodel_status.dart';

import 'package:trackzyn/domain/models/project.dart';
import 'package:trackzyn/domain/models/task.dart';
import 'package:trackzyn/domain/use_cases/get_project_details_usecase.dart';
import 'package:trackzyn/domain/use_cases/get_tasks_usecase.dart';
import 'package:trackzyn/ui/project/widgets/detail_project_state.dart';

class DetailProjectViewModel extends Cubit<DetailProjectState> {
  DetailProjectViewModel(
    GetProjectDetailsUseCase getProjectDetailsUseCase,
    GetTasksUseCase getTasksUseCase,
  ) : _getProjectDetailsUseCase = getProjectDetailsUseCase,
      _getTasksUseCase = getTasksUseCase,
      super(DetailProjectState());

  final GetProjectDetailsUseCase _getProjectDetailsUseCase;
  final GetTasksUseCase _getTasksUseCase;

  String get projectName => state.project?.name ?? 'No Project Name';

  Future<void> loadProjectDetails(int projectId) async {
    ViewModelStatus status = ViewModelStatus.loading;
    emit(state.copyWith(status: status));

    Project? foundProject = await _getProjectDetailsUseCase.execute(projectId);

    status =
        foundProject == null
            ? ViewModelStatus.notFound
            : ViewModelStatus.loaded;

    emit(state.copyWith(project: foundProject, status: status));
  }

  Future<void> loadProjectTasks(int projectId) async {
    ViewModelStatus status = ViewModelStatus.loading;
    emit(state.copyWith(status: status));

    List<Task> tasks = await _getTasksUseCase.execute(projectId);
    status = ViewModelStatus.loaded;

    emit(state.copyWith(tasks: tasks, status: status));
  }
}
