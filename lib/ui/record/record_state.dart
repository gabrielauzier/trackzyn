import 'package:copy_with_extension/copy_with_extension.dart';
import 'package:trackzyn/domain/models/activity.dart';
part 'record_state.g.dart';

enum RecordingStatus { notStarted, recording, paused, stopped, finished }

enum RecordingType { pomodoro, activity }

enum PomodoroType { focus, shortBreak, longBreak }

@CopyWith()
class RecordState {
  final RecordingType type;
  final RecordingStatus status;

  // Pomodoro
  final double pomodoroProgress;
  final PomodoroType pomodoroType;
  final double finalTimeInSec;

  // Activities
  final double activityProgress;
  final List<Activity> activities;

  const RecordState({
    this.status = RecordingStatus.notStarted,
    this.type = RecordingType.pomodoro,
    this.pomodoroType = PomodoroType.focus,
    this.activityProgress = 0.0,
    this.finalTimeInSec = 60 * 5, // Default to 5 minutes
    this.pomodoroProgress = 0.0,
    this.activities = const [],
  });
}
