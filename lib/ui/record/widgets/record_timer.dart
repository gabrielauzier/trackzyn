import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'package:trackzyn/ui/record/record_cubit.dart';
import 'package:trackzyn/ui/record/record_state.dart';
import 'package:trackzyn/ui/record/widgets/arc.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';

class RecordTimer extends StatefulWidget {
  final double diameter;

  const RecordTimer({super.key, this.diameter = 220});

  @override
  State<RecordTimer> createState() => _RecordTimerState();
}

class _RecordTimerState extends State<RecordTimer> {
  Widget _buildButton() {
    var cubit = BlocProvider.of<RecordCubit>(context);

    return GestureDetector(
      onTap: () {
        switch (cubit.status) {
          // Custom
          case RecordingStatus.notStarted:
            break;
          // Stop
          default:
            cubit.stopRecording();
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
            switch (cubit.status) {
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
            switch (cubit.status) {
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
    var cubit = BlocProvider.of<RecordCubit>(context);

    var completedSeconds = cubit.currentTimeInSec.toInt();
    var completedMinutes = (completedSeconds / 60).floor();
    var completedHours = (completedMinutes / 60).floor();

    var finalTimeInSec =
        BlocProvider.of<RecordCubit>(context).finalTimeInSec.toInt();

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
              color: switch (cubit.status) {
                RecordingStatus.notStarted => ColorPalette.neutral900,
                // RecordingStatus.recording => ColorPalette.violet500,
                // RecordingStatus.paused => ColorPalette.amber500,
                RecordingStatus.finished => ColorPalette.green500,
                _ => Colors.black,
              },
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 14),
          if (!(cubit.status == RecordingStatus.finished))
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

  @override
  Widget build(BuildContext context) {
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
                  progress: state.progress,
                  color: switch (state.status) {
                    RecordingStatus.notStarted => ColorPalette.neutral200,
                    RecordingStatus.recording => ColorPalette.violet500,
                    RecordingStatus.paused => ColorPalette.amber500,
                    RecordingStatus.finished => ColorPalette.green500,
                    _ => ColorPalette.transparent,
                  },
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
