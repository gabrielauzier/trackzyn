import 'package:copy_with_extension/copy_with_extension.dart';
import 'package:trackzyn/domain/models/activity.dart';
import 'package:trackzyn/domain/models/project.dart';
import 'package:trackzyn/domain/models/task.dart';
import 'package:trackzyn/domain/models/task_activity_group.dart';
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
  final List<Activity> activities;
  final List<Project> projects;
  final List<Task> tasks;
  final List<TaskActivityGroup> taskActivityGroups;

  final String? taskName;
  final int? taskId;
  get tasksCount => tasks.length;

  final String? projectName;
  final int? projectId;
  get projectsCount => projects.length;

  const RecordState({
    this.status = RecordingStatus.notStarted,
    this.type = RecordingType.pomodoro,
    this.pomodoroType = PomodoroType.focus,
    this.finalTimeInSec = 60 * 5, // Default to 5 minutes
    this.pomodoroProgress = 0.0,
    this.activities = const [],
    this.projects = const [],
    this.tasks = const [],
    this.taskActivityGroups = const [],
    this.taskId,
    this.taskName,
    this.projectName,
    this.projectId,
  });
}
