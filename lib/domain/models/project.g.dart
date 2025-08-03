// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'project.dart';

// **************************************************************************
// CopyWithGenerator
// **************************************************************************

abstract class _$ProjectCWProxy {
  Project id(int? id);

  Project name(String name);

  Project description(String? description);

  Project dueDate(DateTime? dueDate);

  Project createdAt(DateTime? createdAt);

  Project updatedAt(DateTime? updatedAt);

  /// Creates a new instance with the provided field values.
  /// Passing `null` to a nullable field nullifies it, while `null` for a non-nullable field is ignored. To update a single field use `Project(...).copyWith.fieldName(value)`.
  ///
  /// Example:
  /// ```dart
  /// Project(...).copyWith(id: 12, name: "My name")
  /// ```
  Project call({
    int? id,
    String name,
    String? description,
    DateTime? dueDate,
    DateTime? createdAt,
    DateTime? updatedAt,
  });
}

/// Callable proxy for `copyWith` functionality.
/// Use as `instanceOfProject.copyWith(...)` or call `instanceOfProject.copyWith.fieldName(value)` for a single field.
class _$ProjectCWProxyImpl implements _$ProjectCWProxy {
  const _$ProjectCWProxyImpl(this._value);

  final Project _value;

  @override
  Project id(int? id) => this(id: id);

  @override
  Project name(String name) => this(name: name);

  @override
  Project description(String? description) => this(description: description);

  @override
  Project dueDate(DateTime? dueDate) => this(dueDate: dueDate);

  @override
  Project createdAt(DateTime? createdAt) => this(createdAt: createdAt);

  @override
  Project updatedAt(DateTime? updatedAt) => this(updatedAt: updatedAt);

  @override
  /// Creates a new instance with the provided field values.
  /// Passing `null` to a nullable field nullifies it, while `null` for a non-nullable field is ignored. To update a single field use `Project(...).copyWith.fieldName(value)`.
  ///
  /// Example:
  /// ```dart
  /// Project(...).copyWith(id: 12, name: "My name")
  /// ```
  Project call({
    Object? id = const $CopyWithPlaceholder(),
    Object? name = const $CopyWithPlaceholder(),
    Object? description = const $CopyWithPlaceholder(),
    Object? dueDate = const $CopyWithPlaceholder(),
    Object? createdAt = const $CopyWithPlaceholder(),
    Object? updatedAt = const $CopyWithPlaceholder(),
  }) {
    return Project(
      id:
          id == const $CopyWithPlaceholder()
              ? _value.id
              // ignore: cast_nullable_to_non_nullable
              : id as int?,
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
      dueDate:
          dueDate == const $CopyWithPlaceholder()
              ? _value.dueDate
              // ignore: cast_nullable_to_non_nullable
              : dueDate as DateTime?,
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
    );
  }
}

extension $ProjectCopyWith on Project {
  /// Returns a callable class used to build a new instance with modified fields.
  /// Example: `instanceOfProject.copyWith(...)` or `instanceOfProject.copyWith.fieldName(...)`.
  // ignore: library_private_types_in_public_api
  _$ProjectCWProxy get copyWith => _$ProjectCWProxyImpl(this);
}
