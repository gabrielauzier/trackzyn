import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:provider/provider.dart';

import 'package:trackzyn/ui/record/record_cubit.dart';
import 'package:trackzyn/ui/record/record_state.dart';
import 'package:trackzyn/ui/record/widgets/arc.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';

enum PomodoroProgressionType { progressive, regressive }

class PomodoroTimer extends StatefulWidget {
  final double diameter;
  final PomodoroProgressionType type;

  const PomodoroTimer({
    super.key,
    this.diameter = 220,
    this.type = PomodoroProgressionType.progressive,
  });

  @override
  State<PomodoroTimer> createState() => _PomodoroTimerState();
}

class _PomodoroTimerState extends State<PomodoroTimer> {
  late final viewModel = Provider.of<RecordCubit>(context, listen: false);

  final minimalRecordDurationInSec = 5 * 60; // 5 minutes

  Widget _buildButton() {
    return GestureDetector(
      onTap: () {
        switch (viewModel.statusByType(RecordingType.pomodoro)) {
          // Custom
          case RecordingStatus.notStarted:
            break;
          // Stop
          default:
            _handleStopConfirmation();
            break;
        }
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: ColorPalette.neutral200, width: 2),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            switch (viewModel.statusByType(RecordingType.pomodoro)) {
              // Custom
              RecordingStatus.notStarted => const Icon(Icons.edit),
              // Stop
              _ => Container(
                width: 20,
                height: 20,
                decoration: BoxDecoration(
                  shape: BoxShape.rectangle,
                  color: ColorPalette.red500,
                  borderRadius: BorderRadius.circular(6),
                ),
              ),
            },
            const SizedBox(width: 10),
            switch (viewModel.statusByType(RecordingType.pomodoro)) {
              // Custom
              RecordingStatus.notStarted => const Text(
                'Custom',
                style: TextStyle(fontSize: 16),
              ),
              // Stop
              _ => const Text(
                'Stop',
                style: TextStyle(fontSize: 16, color: ColorPalette.red500),
              ),
            },
          ],
        ),
      ),
    );
  }

  Widget _buildTimerInfo() {
    var completedSeconds = viewModel.pomodoroCurrentTimeInSec.toInt();
    var completedMinutes = (completedSeconds / 60).floor();
    var completedHours = (completedMinutes / 60).floor();

    var finalTimeInSec = viewModel.finalTimeInSec.toInt();

    var totalHours = (finalTimeInSec / 3600).floor();
    var totalMinutes = (finalTimeInSec / 60).floor();
    var totalSecondsRest = finalTimeInSec % 60;

    var totalStr = '';

    if (totalSecondsRest > 0) {
      totalStr = '${totalSecondsRest}s';
    }

    if (totalMinutes > 0) {
      totalStr = '${totalMinutes % 60}min $totalStr';
    }

    if (totalHours > 0) {
      totalStr = '${totalHours}h $totalStr';
    }

    return Container(
      width: widget.diameter,
      height: widget.diameter,
      alignment: Alignment.center,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Total $totalStr',
            style: TextStyle(fontSize: 16, color: ColorPalette.neutral700),
          ),
          // const SizedBox(height: 20)
          Text(
            '${completedHours.toString().padLeft(2, '0')}:${(completedMinutes % 60).toString().padLeft(2, '0')}:${(completedSeconds % 60).toString().padLeft(2, '0')}',
            style: TextStyle(
              fontSize: 40,
              color: switch (viewModel.statusByType(RecordingType.pomodoro)) {
                RecordingStatus.notStarted => ColorPalette.neutral400,
                RecordingStatus.paused => ColorPalette.neutral500,
                RecordingStatus.recording => ColorPalette.neutral900,
                RecordingStatus.finished => ColorPalette.green500,
                _ => Colors.black,
              },
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 14),
          if (!(viewModel.statusByType(RecordingType.pomodoro) ==
              RecordingStatus.finished))
            _buildButton()
          else
            Text(
              'Completed!',
              style: TextStyle(
                fontSize: 18,
                color: ColorPalette.green500,
                fontWeight: FontWeight.bold,
              ),
            ),
        ],
      ),
    );
  }

  _onStopConfirmed() {
    viewModel.stopRecording();
    Navigator.of(context).pop(); // Close the dialog
  }

  _onStopCancelled() {
    viewModel.resumeRecording();
    Navigator.of(context).pop(); // Close the dialog
  }

  _handleStopConfirmation() async {
    viewModel.pauseRecording();

    showDialog<bool>(
      context: context,
      builder:
          (context) => AlertDialog(
            title: Text('Stop Timer?'),
            content: Text(
              'Are you sure you want to stop the timer? \n\nRecords with less than 5 minutes won`t be saved.',
              textAlign: TextAlign.left,
            ),
            actions: [
              TextButton(
                onPressed: _onStopCancelled,
                child: Text(
                  'Cancel',
                  style: TextStyle(color: ColorPalette.neutral900),
                ),
              ),
              TextButton(
                onPressed: _onStopConfirmed,
                child: Text(
                  'Stop',
                  style: TextStyle(color: ColorPalette.red600),
                ),
              ),
            ],
          ),
    );
  }

  @override
  Widget build(BuildContext context) {
    getArcColor(RecordState state) {
      switch (state.pomodoroType) {
        case PomodoroType.focus:
          switch (state.status) {
            case RecordingStatus.notStarted:
              return ColorPalette.sky300;
            case RecordingStatus.recording:
              return ColorPalette.violet500;
            case RecordingStatus.paused:
              return ColorPalette.amber500;
            case RecordingStatus.finished:
              return ColorPalette.green500;
            case RecordingStatus.stopped:
              return ColorPalette.red500;
          }

        case PomodoroType.shortBreak:
        case PomodoroType.longBreak:
          switch (state.status) {
            case RecordingStatus.notStarted:
              return ColorPalette.sky500;
            case RecordingStatus.recording:
              return ColorPalette.sky500;
            case RecordingStatus.paused:
              return ColorPalette.amber500;
            case RecordingStatus.finished:
              return ColorPalette.green500;
            case RecordingStatus.stopped:
              return ColorPalette.red500;
          }
      }
    }

    return BlocBuilder<RecordCubit, RecordState>(
      builder: (context, state) {
        return Column(
          children: [
            Stack(
              alignment: Alignment.center,
              children: [
                Container(
                  width: widget.diameter + 24,
                  height: widget.diameter + 24,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white,
                    border: Border.all(
                      color: ColorPalette.neutral100,
                      width: 2,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: ColorPalette.neutral100,
                        blurRadius: 12,
                        // offset: Offset(0, 8),
                      ),
                    ],
                  ),
                ),
                Arc(
                  diameter: widget.diameter,
                  progress: 1,
                  color: ColorPalette.neutral200,
                ),
                Arc(
                  diameter: widget.diameter,
                  progress: state.pomodoroProgress,
                  color: getArcColor(state),
                  pointer: true,
                ),
                _buildTimerInfo(),
              ],
            ),
          ],
        );
      },
    );
  }
}
