// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'task_detail_state.dart';

// **************************************************************************
// CopyWithGenerator
// **************************************************************************

abstract class _$TaskDetailStateCWProxy {
  TaskDetailState task(Task? task);

  TaskDetailState originalTask(Task? originalTask);

  TaskDetailState projects(List<Project> projects);

  TaskDetailState status(ViewModelStatus status);

  TaskDetailState errorMessage(String? errorMessage);

  /// Creates a new instance with the provided field values.
  /// Passing `null` to a nullable field nullifies it, while `null` for a non-nullable field is ignored. To update a single field use `TaskDetailState(...).copyWith.fieldName(value)`.
  ///
  /// Example:
  /// ```dart
  /// TaskDetailState(...).copyWith(id: 12, name: "My name")
  /// ```
  TaskDetailState call({
    Task? task,
    Task? originalTask,
    List<Project> projects,
    ViewModelStatus status,
    String? errorMessage,
  });
}

/// Callable proxy for `copyWith` functionality.
/// Use as `instanceOfTaskDetailState.copyWith(...)` or call `instanceOfTaskDetailState.copyWith.fieldName(value)` for a single field.
class _$TaskDetailStateCWProxyImpl implements _$TaskDetailStateCWProxy {
  const _$TaskDetailStateCWProxyImpl(this._value);

  final TaskDetailState _value;

  @override
  TaskDetailState task(Task? task) => this(task: task);

  @override
  TaskDetailState originalTask(Task? originalTask) =>
      this(originalTask: originalTask);

  @override
  TaskDetailState projects(List<Project> projects) => this(projects: projects);

  @override
  TaskDetailState status(ViewModelStatus status) => this(status: status);

  @override
  TaskDetailState errorMessage(String? errorMessage) =>
      this(errorMessage: errorMessage);

  @override
  /// Creates a new instance with the provided field values.
  /// Passing `null` to a nullable field nullifies it, while `null` for a non-nullable field is ignored. To update a single field use `TaskDetailState(...).copyWith.fieldName(value)`.
  ///
  /// Example:
  /// ```dart
  /// TaskDetailState(...).copyWith(id: 12, name: "My name")
  /// ```
  TaskDetailState call({
    Object? task = const $CopyWithPlaceholder(),
    Object? originalTask = const $CopyWithPlaceholder(),
    Object? projects = const $CopyWithPlaceholder(),
    Object? status = const $CopyWithPlaceholder(),
    Object? errorMessage = const $CopyWithPlaceholder(),
  }) {
    return TaskDetailState(
      task:
          task == const $CopyWithPlaceholder()
              ? _value.task
              // ignore: cast_nullable_to_non_nullable
              : task as Task?,
      originalTask:
          originalTask == const $CopyWithPlaceholder()
              ? _value.originalTask
              // ignore: cast_nullable_to_non_nullable
              : originalTask as Task?,
      projects:
          projects == const $CopyWithPlaceholder()
              ? _value.projects
              // ignore: cast_nullable_to_non_nullable
              : projects as List<Project>,
      status:
          status == const $CopyWithPlaceholder()
              ? _value.status
              // ignore: cast_nullable_to_non_nullable
              : status as ViewModelStatus,
      errorMessage:
          errorMessage == const $CopyWithPlaceholder()
              ? _value.errorMessage
              // ignore: cast_nullable_to_non_nullable
              : errorMessage as String?,
    );
  }
}

extension $TaskDetailStateCopyWith on TaskDetailState {
  /// Returns a callable class used to build a new instance with modified fields.
  /// Example: `instanceOfTaskDetailState.copyWith(...)` or `instanceOfTaskDetailState.copyWith.fieldName(...)`.
  // ignore: library_private_types_in_public_api
  _$TaskDetailStateCWProxy get copyWith => _$TaskDetailStateCWProxyImpl(this);
}
