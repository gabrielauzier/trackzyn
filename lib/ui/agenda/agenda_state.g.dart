// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'agenda_state.dart';

// **************************************************************************
// CopyWithGenerator
// **************************************************************************

abstract class _$AgendaStateCWProxy {
  AgendaState selectedDay(DateTime selectedDay);

  AgendaState daysOfWeek(List<DateTime> daysOfWeek);

  AgendaState activities(List<Activity> activities);

  /// Creates a new instance with the provided field values.
  /// Passing `null` to a nullable field nullifies it, while `null` for a non-nullable field is ignored. To update a single field use `AgendaState(...).copyWith.fieldName(value)`.
  ///
  /// Example:
  /// ```dart
  /// AgendaState(...).copyWith(id: 12, name: "My name")
  /// ```
  AgendaState call({
    DateTime selectedDay,
    List<DateTime> daysOfWeek,
    List<Activity> activities,
  });
}

/// Callable proxy for `copyWith` functionality.
/// Use as `instanceOfAgendaState.copyWith(...)` or call `instanceOfAgendaState.copyWith.fieldName(value)` for a single field.
class _$AgendaStateCWProxyImpl implements _$AgendaStateCWProxy {
  const _$AgendaStateCWProxyImpl(this._value);

  final AgendaState _value;

  @override
  AgendaState selectedDay(DateTime selectedDay) =>
      this(selectedDay: selectedDay);

  @override
  AgendaState daysOfWeek(List<DateTime> daysOfWeek) =>
      this(daysOfWeek: daysOfWeek);

  @override
  AgendaState activities(List<Activity> activities) =>
      this(activities: activities);

  @override
  /// Creates a new instance with the provided field values.
  /// Passing `null` to a nullable field nullifies it, while `null` for a non-nullable field is ignored. To update a single field use `AgendaState(...).copyWith.fieldName(value)`.
  ///
  /// Example:
  /// ```dart
  /// AgendaState(...).copyWith(id: 12, name: "My name")
  /// ```
  AgendaState call({
    Object? selectedDay = const $CopyWithPlaceholder(),
    Object? daysOfWeek = const $CopyWithPlaceholder(),
    Object? activities = const $CopyWithPlaceholder(),
  }) {
    return AgendaState(
      selectedDay:
          selectedDay == const $CopyWithPlaceholder()
              ? _value.selectedDay
              // ignore: cast_nullable_to_non_nullable
              : selectedDay as DateTime,
      daysOfWeek:
          daysOfWeek == const $CopyWithPlaceholder()
              ? _value.daysOfWeek
              // ignore: cast_nullable_to_non_nullable
              : daysOfWeek as List<DateTime>,
      activities:
          activities == const $CopyWithPlaceholder()
              ? _value.activities
              // ignore: cast_nullable_to_non_nullable
              : activities as List<Activity>,
    );
  }
}

extension $AgendaStateCopyWith on AgendaState {
  /// Returns a callable class used to build a new instance with modified fields.
  /// Example: `instanceOfAgendaState.copyWith(...)` or `instanceOfAgendaState.copyWith.fieldName(...)`.
  // ignore: library_private_types_in_public_api
  _$AgendaStateCWProxy get copyWith => _$AgendaStateCWProxyImpl(this);
}
