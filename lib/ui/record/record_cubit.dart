import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:trackzyn/ui/record/record_state.dart';

class RecordCubit extends Cubit<RecordState> {
  RecordCubit() : super(RecordState());

  late Timer _timer;
  double _progress = 0;
  // final double _finalTimeInSec = 60 * 60 * 1 + 60 * 3 + 50; // 1h + 3min + 50sec
  final double _finalTimeInSec = 60 * 5; // 5min
  double _currentTimeInSec = 0;

  void startRecording() {
    double timeStep = 25; // Render every 25 milliseconds
    _timer = Timer.periodic(Duration(milliseconds: 25), (timer) {
      if (_currentTimeInSec < _finalTimeInSec) {
        _currentTimeInSec += timeStep / 1000; // Convert milliseconds to seconds
        _progress = _currentTimeInSec / _finalTimeInSec;
        emit(state.copyWith(progress: _progress));
      } else {
        // Stop the timer when the final time is reached
        _timer.cancel();
        emit(state.copyWith(status: RecordingStatus.finished));
      }
    });

    emit(state.copyWith(status: RecordingStatus.recording));
  }

  void pauseRecording() {
    _timer.cancel();
    emit(state.copyWith(status: RecordingStatus.paused));
  }

  void resumeRecording() {
    startRecording();
    emit(state.copyWith(status: RecordingStatus.recording));
  }

  void stopRecording() {
    _timer.cancel();
    _currentTimeInSec = 0;
    _progress = 0;
    // Reset to 1 minute
    emit(state.copyWith(status: RecordingStatus.notStarted, progress: 0.0));
  }

  double get progress => _progress;

  double get currentTimeInSec => _currentTimeInSec;

  double get finalTimeInSec => _finalTimeInSec;

  RecordingStatus get status => state.status;
}
