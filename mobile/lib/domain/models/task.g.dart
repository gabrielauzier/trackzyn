// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'task.dart';

// **************************************************************************
// CopyWithGenerator
// **************************************************************************

abstract class _$TaskCWProxy {
  Task id(int? id);

  Task projectId(int? projectId);

  Task name(String name);

  Task description(String? description);

  Task createdAt(DateTime? createdAt);

  Task updatedAt(DateTime? updatedAt);

  Task dueDate(DateTime? dueDate);

  Task totalDurationInSeconds(int? totalDurationInSeconds);

  Task projectName(String? projectName);

  Task tags(String? tags);

  Task status(String? status);

  Task priority(String? priority);

  /// Creates a new instance with the provided field values.
  /// Passing `null` to a nullable field nullifies it, while `null` for a non-nullable field is ignored. To update a single field use `Task(...).copyWith.fieldName(value)`.
  ///
  /// Example:
  /// ```dart
  /// Task(...).copyWith(id: 12, name: "My name")
  /// ```
  Task call({
    int? id,
    int? projectId,
    String name,
    String? description,
    DateTime? createdAt,
    DateTime? updatedAt,
    DateTime? dueDate,
    int? totalDurationInSeconds,
    String? projectName,
    String? tags,
    String? status,
    String? priority,
  });
}

/// Callable proxy for `copyWith` functionality.
/// Use as `instanceOfTask.copyWith(...)` or call `instanceOfTask.copyWith.fieldName(value)` for a single field.
class _$TaskCWProxyImpl implements _$TaskCWProxy {
  const _$TaskCWProxyImpl(this._value);

  final Task _value;

  @override
  Task id(int? id) => this(id: id);

  @override
  Task projectId(int? projectId) => this(projectId: projectId);

  @override
  Task name(String name) => this(name: name);

  @override
  Task description(String? description) => this(description: description);

  @override
  Task createdAt(DateTime? createdAt) => this(createdAt: createdAt);

  @override
  Task updatedAt(DateTime? updatedAt) => this(updatedAt: updatedAt);

  @override
  Task dueDate(DateTime? dueDate) => this(dueDate: dueDate);

  @override
  Task totalDurationInSeconds(int? totalDurationInSeconds) =>
      this(totalDurationInSeconds: totalDurationInSeconds);

  @override
  Task projectName(String? projectName) => this(projectName: projectName);

  @override
  Task tags(String? tags) => this(tags: tags);

  @override
  Task status(String? status) => this(status: status);

  @override
  Task priority(String? priority) => this(priority: priority);

  @override
  /// Creates a new instance with the provided field values.
  /// Passing `null` to a nullable field nullifies it, while `null` for a non-nullable field is ignored. To update a single field use `Task(...).copyWith.fieldName(value)`.
  ///
  /// Example:
  /// ```dart
  /// Task(...).copyWith(id: 12, name: "My name")
  /// ```
  Task call({
    Object? id = const $CopyWithPlaceholder(),
    Object? projectId = const $CopyWithPlaceholder(),
    Object? name = const $CopyWithPlaceholder(),
    Object? description = const $CopyWithPlaceholder(),
    Object? createdAt = const $CopyWithPlaceholder(),
    Object? updatedAt = const $CopyWithPlaceholder(),
    Object? dueDate = const $CopyWithPlaceholder(),
    Object? totalDurationInSeconds = const $CopyWithPlaceholder(),
    Object? projectName = const $CopyWithPlaceholder(),
    Object? tags = const $CopyWithPlaceholder(),
    Object? status = const $CopyWithPlaceholder(),
    Object? priority = const $CopyWithPlaceholder(),
  }) {
    return Task(
      id:
          id == const $CopyWithPlaceholder()
              ? _value.id
              // ignore: cast_nullable_to_non_nullable
              : id as int?,
      projectId:
          projectId == const $CopyWithPlaceholder()
              ? _value.projectId
              // ignore: cast_nullable_to_non_nullable
              : projectId as int?,
      name:
          name == const $CopyWithPlaceholder()
              ? _value.name
              // ignore: cast_nullable_to_non_nullable
              : name as String,
      description:
          description == const $CopyWithPlaceholder()
              ? _value.description
              // ignore: cast_nullable_to_non_nullable
              : description as String?,
      createdAt:
          createdAt == const $CopyWithPlaceholder()
              ? _value.createdAt
              // ignore: cast_nullable_to_non_nullable
              : createdAt as DateTime?,
      updatedAt:
          updatedAt == const $CopyWithPlaceholder()
              ? _value.updatedAt
              // ignore: cast_nullable_to_non_nullable
              : updatedAt as DateTime?,
      dueDate:
          dueDate == const $CopyWithPlaceholder()
              ? _value.dueDate
              // ignore: cast_nullable_to_non_nullable
              : dueDate as DateTime?,
      totalDurationInSeconds:
          totalDurationInSeconds == const $CopyWithPlaceholder()
              ? _value.totalDurationInSeconds
              // ignore: cast_nullable_to_non_nullable
              : totalDurationInSeconds as int?,
      projectName:
          projectName == const $CopyWithPlaceholder()
              ? _value.projectName
              // ignore: cast_nullable_to_non_nullable
              : projectName as String?,
      tags:
          tags == const $CopyWithPlaceholder()
              ? _value.tags
              // ignore: cast_nullable_to_non_nullable
              : tags as String?,
      status:
          status == const $CopyWithPlaceholder()
              ? _value.status
              // ignore: cast_nullable_to_non_nullable
              : status as String?,
      priority:
          priority == const $CopyWithPlaceholder()
              ? _value.priority
              // ignore: cast_nullable_to_non_nullable
              : priority as String?,
    );
  }
}

extension $TaskCopyWith on Task {
  /// Returns a callable class used to build a new instance with modified fields.
  /// Example: `instanceOfTask.copyWith(...)` or `instanceOfTask.copyWith.fieldName(...)`.
  // ignore: library_private_types_in_public_api
  _$TaskCWProxy get copyWith => _$TaskCWProxyImpl(this);
}
