// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'record_state.dart';

// **************************************************************************
// CopyWithGenerator
// **************************************************************************

abstract class _$RecordStateCWProxy {
  RecordState status(RecordingStatus status);

  RecordState type(RecordingType type);

  RecordState pomodoroType(PomodoroType pomodoroType);

  RecordState activityProgress(double activityProgress);

  RecordState finalTimeInSec(double finalTimeInSec);

  RecordState pomodoroProgress(double pomodoroProgress);

  RecordState activities(List<Activity> activities);

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
    double activityProgress,
    double finalTimeInSec,
    double pomodoroProgress,
    List<Activity> activities,
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
  RecordState activityProgress(double activityProgress) =>
      this(activityProgress: activityProgress);

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
    Object? activityProgress = const $CopyWithPlaceholder(),
    Object? finalTimeInSec = const $CopyWithPlaceholder(),
    Object? pomodoroProgress = const $CopyWithPlaceholder(),
    Object? activities = const $CopyWithPlaceholder(),
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
      activityProgress:
          activityProgress == const $CopyWithPlaceholder()
              ? _value.activityProgress
              // ignore: cast_nullable_to_non_nullable
              : activityProgress as double,
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
    );
  }
}

extension $RecordStateCopyWith on RecordState {
  /// Returns a callable class used to build a new instance with modified fields.
  /// Example: `instanceOfRecordState.copyWith(...)` or `instanceOfRecordState.copyWith.fieldName(...)`.
  // ignore: library_private_types_in_public_api
  _$RecordStateCWProxy get copyWith => _$RecordStateCWProxyImpl(this);
}
