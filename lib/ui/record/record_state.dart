import 'package:copy_with_extension/copy_with_extension.dart';
part 'record_state.g.dart';

enum RecordingStatus { notStarted, recording, paused, stopped, finished }

@CopyWith()
class RecordState {
  final RecordingStatus status;
  final double progress;

  const RecordState({
    this.status = RecordingStatus.notStarted,
    this.progress = 0.0,
  });
}
