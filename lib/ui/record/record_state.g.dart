// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'record_state.dart';

// **************************************************************************
// CopyWithGenerator
// **************************************************************************

abstract class _$RecordStateCWProxy {
  RecordState status(RecordingStatus status);

  RecordState progress(double progress);

  /// Creates a new instance with the provided field values.
  /// Passing `null` to a nullable field nullifies it, while `null` for a non-nullable field is ignored. To update a single field use `RecordState(...).copyWith.fieldName(value)`.
  ///
  /// Example:
  /// ```dart
  /// RecordState(...).copyWith(id: 12, name: "My name")
  /// ```
  RecordState call({RecordingStatus status, double progress});
}

/// Callable proxy for `copyWith` functionality.
/// Use as `instanceOfRecordState.copyWith(...)` or call `instanceOfRecordState.copyWith.fieldName(value)` for a single field.
class _$RecordStateCWProxyImpl implements _$RecordStateCWProxy {
  const _$RecordStateCWProxyImpl(this._value);

  final RecordState _value;

  @override
  RecordState status(RecordingStatus status) => this(status: status);

  @override
  RecordState progress(double progress) => this(progress: progress);

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
    Object? progress = const $CopyWithPlaceholder(),
  }) {
    return RecordState(
      status:
          status == const $CopyWithPlaceholder()
              ? _value.status
              // ignore: cast_nullable_to_non_nullable
              : status as RecordingStatus,
      progress:
          progress == const $CopyWithPlaceholder()
              ? _value.progress
              // ignore: cast_nullable_to_non_nullable
              : progress as double,
    );
  }
}

extension $RecordStateCopyWith on RecordState {
  /// Returns a callable class used to build a new instance with modified fields.
  /// Example: `instanceOfRecordState.copyWith(...)` or `instanceOfRecordState.copyWith.fieldName(...)`.
  // ignore: library_private_types_in_public_api
  _$RecordStateCWProxy get copyWith => _$RecordStateCWProxyImpl(this);
}
