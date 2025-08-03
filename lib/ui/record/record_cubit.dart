import 'dart:async';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'package:trackzyn/ui/record/record_state.dart';

class RecordCubit extends Cubit<RecordState> {
  RecordCubit() : super(RecordState());

  static const double FOCUS_DURATION = 25 * 60; // 25 minutes in seconds
  static const double SHORT_BREAK_DURATION = 5 * 60; // 5 minutes in seconds
  static const double LONG_BREAK_DURATION = 15 * 60; // 15 minutes

  late Timer _timer;
  double _progress = 0;
  // final double _finalTimeInSec = 60 * 60 * 1 + 60 * 3 + 50; // 1h + 3min + 50sec
  double _finalTimeInSec = FOCUS_DURATION; // 5min
  double _currentTimeInSec = 0;

  void startRecording(RecordingType type) {
    double timeStep = 250; // Render every 250 milliseconds
    _timer = Timer.periodic(Duration(milliseconds: timeStep.floor()), (timer) {
      switch (type) {
        case RecordingType.pomodoro:
          if (_currentTimeInSec < _finalTimeInSec) {
            _currentTimeInSec +=
                timeStep / 1000; // Convert milliseconds to seconds
            _progress = _currentTimeInSec / _finalTimeInSec;
            emit(state.copyWith(pomodoroProgress: _progress));
          } else {
            // Stop the timer when the final time is reached
            _timer.cancel();
            emit(state.copyWith(status: RecordingStatus.finished));
          }
          break;
        case RecordingType.activity:
          _currentTimeInSec +=
              timeStep / 1000; // Convert milliseconds to seconds
          _progress = _currentTimeInSec / _finalTimeInSec;
          emit(state.copyWith(activityProgress: _progress));
          break;
      }
    });

    emit(
      state.copyWith(
        status: RecordingStatus.recording,
        type: type,
        finalTimeInSec: _finalTimeInSec,
      ),
    );
  }

  void pauseRecording() {
    _timer.cancel();
    emit(state.copyWith(status: RecordingStatus.paused));
  }

  void resumeRecording() {
    startRecording(state.type);
    emit(state.copyWith(status: RecordingStatus.recording));
  }

  void stopRecording({bool completed = false}) {
    _timer.cancel();
    _currentTimeInSec = 0;
    _progress = 0;
    emit(
      state.copyWith(
        status: RecordingStatus.notStarted,
        pomodoroProgress: 0.0,
        activityProgress: 0.0,
      ),
    );
  }

  void changePomodoroType(PomodoroType type) {
    if (state.status == RecordingStatus.recording ||
        state.status == RecordingStatus.paused) {
      return; // Prevent changing type while recording
    }

    switch (type) {
      case PomodoroType.focus:
        _finalTimeInSec = FOCUS_DURATION;
        break;
      case PomodoroType.shortBreak:
        _finalTimeInSec = SHORT_BREAK_DURATION;
        break;
      case PomodoroType.longBreak:
        _finalTimeInSec = LONG_BREAK_DURATION;
        break;
    }

    _currentTimeInSec = 0; // Reset current time when changing type

    emit(
      state.copyWith(
        pomodoroType: type,
        finalTimeInSec: _finalTimeInSec,
        status: RecordingStatus.notStarted,
        pomodoroProgress: 0.0,
      ),
    );
  }

  double get progress => _progress;

  double get pomodoroCurrentTimeInSec {
    if (state.type != RecordingType.pomodoro) {
      return 0;
    }
    return _currentTimeInSec;
  }

  double get activityCurrentTimeInSec {
    if (state.type != RecordingType.activity) {
      return 0;
    }
    return _currentTimeInSec;
  }

  double get finalTimeInSec => _finalTimeInSec;

  RecordingStatus get status => state.status;

  RecordingStatus statusByType(RecordingType type) {
    if (state.type != type) {
      return RecordingStatus.notStarted;
    }
    return state.status;
  }
}
