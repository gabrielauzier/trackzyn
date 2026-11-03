// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'detail_project_state.dart';

// **************************************************************************
// CopyWithGenerator
// **************************************************************************

abstract class _$DetailProjectStateCWProxy {
  DetailProjectState project(Project? project);

  DetailProjectState tasks(List<Task> tasks);

  DetailProjectState status(ViewModelStatus status);

  /// Creates a new instance with the provided field values.
  /// Passing `null` to a nullable field nullifies it, while `null` for a non-nullable field is ignored. To update a single field use `DetailProjectState(...).copyWith.fieldName(value)`.
  ///
  /// Example:
  /// ```dart
  /// DetailProjectState(...).copyWith(id: 12, name: "My name")
  /// ```
  DetailProjectState call({
    Project? project,
    List<Task> tasks,
    ViewModelStatus status,
  });
}

/// Callable proxy for `copyWith` functionality.
/// Use as `instanceOfDetailProjectState.copyWith(...)` or call `instanceOfDetailProjectState.copyWith.fieldName(value)` for a single field.
class _$DetailProjectStateCWProxyImpl implements _$DetailProjectStateCWProxy {
  const _$DetailProjectStateCWProxyImpl(this._value);

  final DetailProjectState _value;

  @override
  DetailProjectState project(Project? project) => this(project: project);

  @override
  DetailProjectState tasks(List<Task> tasks) => this(tasks: tasks);

  @override
  DetailProjectState status(ViewModelStatus status) => this(status: status);

  @override
  /// Creates a new instance with the provided field values.
  /// Passing `null` to a nullable field nullifies it, while `null` for a non-nullable field is ignored. To update a single field use `DetailProjectState(...).copyWith.fieldName(value)`.
  ///
  /// Example:
  /// ```dart
  /// DetailProjectState(...).copyWith(id: 12, name: "My name")
  /// ```
  DetailProjectState call({
    Object? project = const $CopyWithPlaceholder(),
    Object? tasks = const $CopyWithPlaceholder(),
    Object? status = const $CopyWithPlaceholder(),
  }) {
    return DetailProjectState(
      project:
          project == const $CopyWithPlaceholder()
              ? _value.project
              // ignore: cast_nullable_to_non_nullable
              : project as Project?,
      tasks:
          tasks == const $CopyWithPlaceholder()
              ? _value.tasks
              // ignore: cast_nullable_to_non_nullable
              : tasks as List<Task>,
      status:
          status == const $CopyWithPlaceholder()
              ? _value.status
              // ignore: cast_nullable_to_non_nullable
              : status as ViewModelStatus,
    );
  }
}

extension $DetailProjectStateCopyWith on DetailProjectState {
  /// Returns a callable class used to build a new instance with modified fields.
  /// Example: `instanceOfDetailProjectState.copyWith(...)` or `instanceOfDetailProjectState.copyWith.fieldName(...)`.
  // ignore: library_private_types_in_public_api
  _$DetailProjectStateCWProxy get copyWith =>
      _$DetailProjectStateCWProxyImpl(this);
}
