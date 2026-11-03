import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:trackzyn/domain/enums/viewmodel_status.dart';
import 'package:trackzyn/domain/models/task.dart';
import 'package:trackzyn/domain/use_cases/get_one_task_usecase.dart';
import 'package:trackzyn/domain/use_cases/get_projects_usecase.dart';
import 'package:trackzyn/domain/use_cases/save_task_usecase.dart';
import 'package:trackzyn/ui/task/task_detail_state.dart';

class TaskDetailViewModel extends Cubit<TaskDetailState> {
  TaskDetailViewModel(
    GetProjectsUseCase getProjectsUseCase,
    GetOneTaskUseCase getOneTaskUseCase,
    SaveTaskUseCase saveTaskUseCase,
  ) : _getProjectsUseCase = getProjectsUseCase,
      _getOneTaskUseCase = getOneTaskUseCase,
      _saveTaskUseCase = saveTaskUseCase,
      super(TaskDetailState());

  final GetProjectsUseCase _getProjectsUseCase;
  final GetOneTaskUseCase _getOneTaskUseCase;
  final SaveTaskUseCase _saveTaskUseCase;

  Future<void> getTask(int taskId, void Function(Task task) callback) async {
    try {
      emit(state.copyWith(status: ViewModelStatus.loading));
      final task = await _getOneTaskUseCase.execute(taskId);

      if (task == null) {
        emit(
          state.copyWith(
            status: ViewModelStatus.error,
            errorMessage:
                'The task you are looking for does not\n exist or could not be found.',
          ),
        );
        return;
      }

      emit(
        state.copyWith(
          task: task,
          originalTask: task,
          status: ViewModelStatus.loaded,
        ),
      );

      callback(task);
    } catch (e) {
      debugPrint('Erro ao buscar tarefa: $e');
    }
  }

  Future<void> getProjects() async {
    try {
      final projects = await _getProjectsUseCase.execute();
      emit(state.copyWith(projects: projects));
    } catch (e) {
      debugPrint('Erro ao buscar projetos: $e');
    }
  }

  void updateTaskField(Task? updatedTask) {
    emit(state.copyWith(task: updatedTask));
  }

  void resetTaskDescription() {
    var task = state.task;
    task?.resetDescription();
    emit(state.copyWith(task: task));
  }

  Future<bool> saveChanges() async {
    if (state.task == null) return false;
    if (hasUnsavedChanges == false) return false;

    emit(state.copyWith(status: ViewModelStatus.loading));

    var result = await _saveTaskUseCase.execute(state.task!);

    if (!result) {
      emit(
        state.copyWith(
          errorMessage: 'Error trying to save changes.',
          status: ViewModelStatus.error,
        ),
      );
    }

    emit(state.copyWith(status: ViewModelStatus.loaded));

    return result;
  }

  bool get hasUnsavedChanges {
    return state.task != state.originalTask;
  }
}
