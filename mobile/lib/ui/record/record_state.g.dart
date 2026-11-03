// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'record_state.dart';

// **************************************************************************
// CopyWithGenerator
// **************************************************************************

abstract class _$RecordStateCWProxy {
  RecordState status(RecordingStatus status);

  RecordState type(RecordingType type);

  RecordState pomodoroType(PomodoroType pomodoroType);

  RecordState finalTimeInSec(double finalTimeInSec);

  RecordState pomodoroProgress(double pomodoroProgress);

  RecordState activities(List<Activity> activities);

  RecordState projects(List<Project> projects);

  RecordState tasks(List<Task> tasks);

  RecordState taskActivityGroups(List<TaskActivityGroup> taskActivityGroups);

  RecordState taskId(int? taskId);

  RecordState taskName(String? taskName);

  RecordState projectName(String? projectName);

  RecordState projectId(int? projectId);

  /// Creates a new instance with the provided field values.
  /// Passing `null` to a nullable field nullifies it, while `null` for a non-nullable field is ignored. To update a single field use `RecordState(...).copyWith.fieldName(value)`.
  ///
  /// Example:
  /// ```dart
  /// RecordState(...).copyWith(id: 12, name: "My name")
  /// ```
  RecordState call({
    RecordingStatus status,
    RecordingType type,
    PomodoroType pomodoroType,
    double finalTimeInSec,
    double pomodoroProgress,
    List<Activity> activities,
    List<Project> projects,
    List<Task> tasks,
    List<TaskActivityGroup> taskActivityGroups,
    int? taskId,
    String? taskName,
    String? projectName,
    int? projectId,
  });
}

/// Callable proxy for `copyWith` functionality.
/// Use as `instanceOfRecordState.copyWith(...)` or call `instanceOfRecordState.copyWith.fieldName(value)` for a single field.
class _$RecordStateCWProxyImpl implements _$RecordStateCWProxy {
  const _$RecordStateCWProxyImpl(this._value);

  final RecordState _value;

  @override
  RecordState status(RecordingStatus status) => this(status: status);

  @override
  RecordState type(RecordingType type) => this(type: type);

  @override
  RecordState pomodoroType(PomodoroType pomodoroType) =>
      this(pomodoroType: pomodoroType);

  @override
  RecordState finalTimeInSec(double finalTimeInSec) =>
      this(finalTimeInSec: finalTimeInSec);

  @override
  RecordState pomodoroProgress(double pomodoroProgress) =>
      this(pomodoroProgress: pomodoroProgress);

  @override
  RecordState activities(List<Activity> activities) =>
      this(activities: activities);

  @override
  RecordState projects(List<Project> projects) => this(projects: projects);

  @override
  RecordState tasks(List<Task> tasks) => this(tasks: tasks);

  @override
  RecordState taskActivityGroups(List<TaskActivityGroup> taskActivityGroups) =>
      this(taskActivityGroups: taskActivityGroups);

  @override
  RecordState taskId(int? taskId) => this(taskId: taskId);

  @override
  RecordState taskName(String? taskName) => this(taskName: taskName);

  @override
  RecordState projectName(String? projectName) =>
      this(projectName: projectName);

  @override
  RecordState projectId(int? projectId) => this(projectId: projectId);

  @override
  /// Creates a new instance with the provided field values.
  /// Passing `null` to a nullable field nullifies it, while `null` for a non-nullable field is ignored. To update a single field use `RecordState(...).copyWith.fieldName(value)`.
  ///
  /// Example:
  /// ```dart
  /// RecordState(...).copyWith(id: 12, name: "My name")
  /// ```
  RecordState call({
    Object? status = const $CopyWithPlaceholder(),
    Object? type = const $CopyWithPlaceholder(),
    Object? pomodoroType = const $CopyWithPlaceholder(),
    Object? finalTimeInSec = const $CopyWithPlaceholder(),
    Object? pomodoroProgress = const $CopyWithPlaceholder(),
    Object? activities = const $CopyWithPlaceholder(),
    Object? projects = const $CopyWithPlaceholder(),
    Object? tasks = const $CopyWithPlaceholder(),
    Object? taskActivityGroups = const $CopyWithPlaceholder(),
    Object? taskId = const $CopyWithPlaceholder(),
    Object? taskName = const $CopyWithPlaceholder(),
    Object? projectName = const $CopyWithPlaceholder(),
    Object? projectId = const $CopyWithPlaceholder(),
  }) {
    return RecordState(
      status:
          status == const $CopyWithPlaceholder()
              ? _value.status
              // ignore: cast_nullable_to_non_nullable
              : status as RecordingStatus,
      type:
          type == const $CopyWithPlaceholder()
              ? _value.type
              // ignore: cast_nullable_to_non_nullable
              : type as RecordingType,
      pomodoroType:
          pomodoroType == const $CopyWithPlaceholder()
              ? _value.pomodoroType
              // ignore: cast_nullable_to_non_nullable
              : pomodoroType as PomodoroType,
      finalTimeInSec:
          finalTimeInSec == const $CopyWithPlaceholder()
              ? _value.finalTimeInSec
              // ignore: cast_nullable_to_non_nullable
              : finalTimeInSec as double,
      pomodoroProgress:
          pomodoroProgress == const $CopyWithPlaceholder()
              ? _value.pomodoroProgress
              // ignore: cast_nullable_to_non_nullable
              : pomodoroProgress as double,
      activities:
          activities == const $CopyWithPlaceholder()
              ? _value.activities
              // ignore: cast_nullable_to_non_nullable
              : activities as List<Activity>,
      projects:
          projects == const $CopyWithPlaceholder()
              ? _value.projects
              // ignore: cast_nullable_to_non_nullable
              : projects as List<Project>,
      tasks:
          tasks == const $CopyWithPlaceholder()
              ? _value.tasks
              // ignore: cast_nullable_to_non_nullable
              : tasks as List<Task>,
      taskActivityGroups:
          taskActivityGroups == const $CopyWithPlaceholder()
              ? _value.taskActivityGroups
              // ignore: cast_nullable_to_non_nullable
              : taskActivityGroups as List<TaskActivityGroup>,
      taskId:
          taskId == const $CopyWithPlaceholder()
              ? _value.taskId
              // ignore: cast_nullable_to_non_nullable
              : taskId as int?,
      taskName:
          taskName == const $CopyWithPlaceholder()
              ? _value.taskName
              // ignore: cast_nullable_to_non_nullable
              : taskName as String?,
      projectName:
          projectName == const $CopyWithPlaceholder()
              ? _value.projectName
              // ignore: cast_nullable_to_non_nullable
              : projectName as String?,
      projectId:
          projectId == const $CopyWithPlaceholder()
              ? _value.projectId
              // ignore: cast_nullable_to_non_nullable
              : projectId as int?,
    );
  }
}

extension $RecordStateCopyWith on RecordState {
  /// Returns a callable class used to build a new instance with modified fields.
  /// Example: `instanceOfRecordState.copyWith(...)` or `instanceOfRecordState.copyWith.fieldName(...)`.
  // ignore: library_private_types_in_public_api
  _$RecordStateCWProxy get copyWith => _$RecordStateCWProxyImpl(this);
}
