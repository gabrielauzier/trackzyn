// ignore_for_file: constant_identifier_names

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'package:trackzyn/domain/models/activity.dart';
import 'package:trackzyn/domain/models/project.dart';
import 'package:trackzyn/domain/models/task.dart';
import 'package:trackzyn/domain/use_cases/add_activity_usecase.dart';
import 'package:trackzyn/domain/use_cases/add_project_usecase.dart';
import 'package:trackzyn/domain/use_cases/add_task_usecase.dart';
import 'package:trackzyn/domain/use_cases/export_activities_usecase.dart';
import 'package:trackzyn/domain/use_cases/get_activities_usecase.dart';
import 'package:trackzyn/domain/use_cases/get_projects_usecase.dart';
import 'package:trackzyn/domain/use_cases/get_task_activity_group_usecase.dart';
import 'package:trackzyn/domain/use_cases/get_tasks_usecase.dart';
import 'package:trackzyn/ui/record/record_state.dart';
import 'package:trackzyn/ui/record/widgets/sheets/export_report_sheet.dart';

class RecordCubit extends Cubit<RecordState> {
  RecordCubit(
    AddActivityUseCase addActivityUseCase,
    GetActivitiesUseCase getActivitiesUseCase,
    AddProjectUseCase addProjectUseCase,
    GetProjectsUseCase getProjectsUseCase,
    GetTasksUseCase getTasksUseCase,
    AddTaskUseCase addTaskUseCase,
    GetTaskActivityGroupUseCase getTaskActivityGroupUseCase,
    ExportActivitiesUseCase exportActivitiesUseCase,
  ) : _addActivityUseCase = addActivityUseCase,
      _getActivitiesUseCase = getActivitiesUseCase,
      _addProjectUseCase = addProjectUseCase,
      _getProjectsUseCase = getProjectsUseCase,
      _getTasksUseCase = getTasksUseCase,
      _addTaskUseCase = addTaskUseCase,
      _getTaskActivityGroupUseCase = getTaskActivityGroupUseCase,
      _exportActivitiesUseCase = exportActivitiesUseCase,
      super(RecordState());

  final AddActivityUseCase _addActivityUseCase;
  final GetActivitiesUseCase _getActivitiesUseCase;
  final AddProjectUseCase _addProjectUseCase;
  final GetProjectsUseCase _getProjectsUseCase;
  final GetTasksUseCase _getTasksUseCase;
  final AddTaskUseCase _addTaskUseCase;
  final GetTaskActivityGroupUseCase _getTaskActivityGroupUseCase;
  final ExportActivitiesUseCase _exportActivitiesUseCase;

  static const double FOCUS_DURATION = 25 * 60; // 25 minutes in seconds
  static const double SHORT_BREAK_DURATION = 5 * 60; // 5 minutes in seconds
  static const double LONG_BREAK_DURATION = 15 * 60; // 15 minutes

  late Timer _timer;
  double _progress = 0;
  // final double _finalTimeInSec = 60 * 60 * 1 + 60 * 3 + 50; // 1h + 3min + 50sec
  double _finalTimeInSec = FOCUS_DURATION; // 5min
  double _currentTimeInSec = 0;
  late DateTime _startedAt;

  void _startTimer(RecordingType type) {
    double timeStep = 200; // Render every 250 milliseconds
    _timer = Timer.periodic(Duration(milliseconds: timeStep.floor()), (timer) {
      switch (type) {
        case RecordingType.pomodoro:
          if (_currentTimeInSec < _finalTimeInSec) {
            _currentTimeInSec +=
                timeStep / 1000; // Convert milliseconds to seconds
            _progress = _currentTimeInSec / _finalTimeInSec;
            emit(state.copyWith(pomodoroProgress: _progress));
          } else {
            // Stop the timer when the final time is reached
            _timer.cancel();
            emit(state.copyWith(status: RecordingStatus.finished));
          }
          break;
        case RecordingType.activity:
          _currentTimeInSec +=
              timeStep / 1000; // Convert milliseconds to seconds
          _progress = _currentTimeInSec / _finalTimeInSec;
          emit(state.copyWith(activityProgress: _progress));
          break;
      }
    });
  }

  void startRecording(RecordingType type) {
    _startTimer(type);
    _startedAt = DateTime.now();

    emit(
      state.copyWith(
        status: RecordingStatus.recording,
        type: type,
        finalTimeInSec: _finalTimeInSec,
      ),
    );
  }

  void pauseRecording() {
    _timer.cancel();
    emit(state.copyWith(status: RecordingStatus.paused));
  }

  void resumeRecording() {
    _startTimer(state.type);
    emit(state.copyWith(status: RecordingStatus.recording));
  }

  void stopRecording({bool completed = false}) async {
    await _addActivityUseCase.execute(
      Activity(
        startedAt: _startedAt,
        durationInSeconds: _currentTimeInSec.toInt(),
        taskId: state.taskId,
        taskName: state.taskName,
        projectName: state.projectName,
        projectId: state.projectId,
        finishedAt: DateTime.now(),
      ),
    );

    emit(
      state.copyWith(
        status: RecordingStatus.notStarted,
        pomodoroProgress: 0.0,
        activityProgress: 0.0,
      ),
    );

    _timer.cancel();
    _currentTimeInSec = 0;
    _progress = 0;

    getActivities();
  }

  void changePomodoroType(PomodoroType type) {
    if (state.status == RecordingStatus.recording ||
        state.status == RecordingStatus.paused) {
      return; // Prevent changing type while recording
    }

    switch (type) {
      case PomodoroType.focus:
        _finalTimeInSec = FOCUS_DURATION;
        break;
      case PomodoroType.shortBreak:
        _finalTimeInSec = SHORT_BREAK_DURATION;
        break;
      case PomodoroType.longBreak:
        _finalTimeInSec = LONG_BREAK_DURATION;
        break;
    }

    _currentTimeInSec = 0; // Reset current time when changing type

    emit(
      state.copyWith(
        pomodoroType: type,
        finalTimeInSec: _finalTimeInSec,
        status: RecordingStatus.notStarted,
        pomodoroProgress: 0.0,
      ),
    );
  }

  void assignProject(int? projectId) {
    Project? project = state.projects.firstWhere(
      (p) => p.id == projectId,
      orElse: () => Project(id: null, name: ''),
    );
    emit(
      state.copyWith(
        projectId: project.id,
        projectName: project.name.isEmpty ? null : project.name,
        taskId: null, // Reset task when changing project
        taskName: null, // Reset task name when changing project
      ),
    );

    if (project.id == null) {
      emit(state.copyWith(taskId: null, taskName: null));
    }

    getTasks();
  }

  void assignTask(int? taskId) {
    Task? task = state.tasks.firstWhere(
      (t) => t.id == taskId,
      orElse: () => Task(id: null, name: ''),
    );
    emit(
      state.copyWith(
        taskId: task.id,
        taskName: task.name.isEmpty ? null : task.name,
      ),
    );
  }

  Future<int?> addActivity({
    required DateTime startedAt,
    required DateTime finishedAt,
    required int durationInSeconds,
    String? note,
    int? taskId,
    int? projectId,
  }) async {
    try {
      final newActivityId = await _addActivityUseCase.execute(
        Activity(
          startedAt: startedAt,
          finishedAt: finishedAt,
          durationInSeconds: durationInSeconds,
          note: note,
          taskId: taskId,
          projectId: projectId,
        ),
      );

      getActivities();

      return newActivityId;
    } catch (e) {
      debugPrint('Erro ao adicionar atividade: $e');
    }

    return null;
  }

  void getActivities({String? taskName}) async {
    try {
      final taskActivityGroups = await _getTaskActivityGroupUseCase.execute(
        taskName: taskName,
      );

      emit(state.copyWith(taskActivityGroups: taskActivityGroups));
    } catch (e) {
      debugPrint('Erro ao buscar atividades: $e');
      emit(state.copyWith(taskActivityGroups: []));
    }
  }

  Future<void> getActivitiesByTaskAndDate({
    String? date,
    int? taskId,
    int? projectId,
  }) async {
    try {
      emit(state.copyWith(activities: []));

      final activities = await _getActivitiesUseCase.execute(
        taskId: taskId,
        projectId: projectId,
        date: date,
      );
      emit(state.copyWith(activities: activities));
    } catch (e) {
      debugPrint('Erro ao buscar atividades por tarefa e data: $e');
      emit(state.copyWith(activities: []));
    }
  }

  Future<void> getActivitiesByDateOnly({String? date}) async {
    try {
      emit(state.copyWith(activities: []));

      final activities = await _getActivitiesUseCase.execute(
        date: date,
        searchAll: true,
      );
      emit(state.copyWith(activities: activities));
    } catch (e) {
      debugPrint('Erro ao buscar atividades por data: $e');
      emit(state.copyWith(activities: []));
    }
  }

  void addProject(String projectName) async {
    try {
      final project = Project(name: projectName);
      final createdProjectId = await _addProjectUseCase.execute(project);
      emit(
        state.copyWith(
          projectId: createdProjectId,
          projectName: projectName,
          taskId: null,
          taskName: null,
          tasks: [],
        ),
      );
      getProjects(); // Refresh the project list after adding
    } catch (e) {
      debugPrint('Erro ao adicionar projeto: $e');
    }
  }

  void getProjects() async {
    try {
      final projects = await _getProjectsUseCase.execute();
      emit(state.copyWith(projects: projects));
    } catch (e) {
      debugPrint('Erro ao buscar projetos: $e');
    }
  }

  void addTask(String taskName) async {
    try {
      final task = Task(name: taskName, projectId: state.projectId);
      final createdTaskId = await _addTaskUseCase.execute(task);
      emit(state.copyWith(taskId: createdTaskId, taskName: taskName));
      getTasks(); // Refresh the task list after adding
    } catch (e) {
      debugPrint('Erro ao adicionar tarefa: $e');
    }
  }

  void getTasks() async {
    try {
      final tasks = await _getTasksUseCase.execute(state.projectId);
      emit(state.copyWith(tasks: tasks));
    } catch (e) {
      debugPrint('Erro ao buscar tarefas: $e');
    }
  }

  Future<List<Task>> getProjectTasks(int projectId) async {
    try {
      final tasks = await _getTasksUseCase.execute(projectId);
      return tasks;
    } catch (e) {
      debugPrint('Erro ao buscar tarefas do projeto: $e');
      return [];
    }
  }

  Future<String?> exportActivities(FileExtension ext) async {
    try {
      final activities = state.activities;
      if (activities.isEmpty) {
        debugPrint('Nenhuma atividade para exportar.');
        return null;
      }

      final filePath = await _exportActivitiesUseCase.execute(activities, ext);
      if (filePath != null) {
        debugPrint('Atividades exportadas com sucesso.');
        return filePath;
      } else {
        debugPrint('Falha ao exportar atividades.');
      }
    } catch (e) {
      debugPrint('Erro ao exportar atividades: $e');
    }

    return null;
  }

  openDownloadFolder() async {
    try {
      await _exportActivitiesUseCase.open();
    } catch (e) {
      debugPrint('Erro ao abrir arquivo exportado: $e');
    }
  }

  double get progress => _progress;

  double get pomodoroCurrentTimeInSec {
    if (state.type != RecordingType.pomodoro) {
      return 0;
    }
    return _currentTimeInSec;
  }

  double get activityCurrentTimeInSec {
    if (state.type != RecordingType.activity) {
      return 0;
    }
    return _currentTimeInSec;
  }

  double get finalTimeInSec => _finalTimeInSec;

  RecordingStatus get status => state.status;

  RecordingStatus statusByType(RecordingType type) {
    if (state.type != type) {
      return RecordingStatus.notStarted;
    }
    return state.status;
  }
}
