import 'package:copy_with_extension/copy_with_extension.dart';
import 'package:trackzyn/domain/models/activity.dart';
import 'package:trackzyn/ui/utils/date_compare.dart';

part 'agenda_state.g.dart';

@CopyWith()
class AgendaState {
  final DateTime selectedDay;
  final List<DateTime> daysOfWeek;
  final List<Activity> activities;

  AgendaState({
    required this.selectedDay,
    required this.daysOfWeek,
    required this.activities,
  });

  get selectedToday => dateCompare(selectedDay, DateTime.now());

  factory AgendaState.initial() {
    final today = DateTime.now();
    return AgendaState(
      selectedDay: today,
      daysOfWeek: List.generate(7, (index) {
        final day = today.subtract(Duration(days: today.weekday - index));
        return DateTime(day.year, day.month, day.day);
      }),
      activities: [],
    );
  }
}
