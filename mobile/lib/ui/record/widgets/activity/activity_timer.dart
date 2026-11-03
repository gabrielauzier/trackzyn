import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'package:trackzyn/ui/record/record_cubit.dart';
import 'package:trackzyn/ui/record/record_state.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';

class ActivityTimer extends StatefulWidget {
  const ActivityTimer({super.key});

  @override
  State<ActivityTimer> createState() => _ActivityTimerState();
}

class _ActivityTimerState extends State<ActivityTimer> {
  Widget _buildTimerInfo() {
    var cubit = BlocProvider.of<RecordCubit>(context);

    var completedSeconds = cubit.activityCurrentTimeInSec.toInt();
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
      alignment: Alignment.center,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '${completedHours.toString().padLeft(2, '0')}:${(completedMinutes % 60).toString().padLeft(2, '0')}:${(completedSeconds % 60).toString().padLeft(2, '0')}',
            style: TextStyle(
              fontSize: 52,
              color: switch (cubit.status) {
                RecordingStatus.notStarted => ColorPalette.neutral400,
                RecordingStatus.paused => ColorPalette.neutral500,
                RecordingStatus.recording => ColorPalette.neutral900,
                RecordingStatus.finished => ColorPalette.green500,
                _ => Colors.black,
              },
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
        return _buildTimerInfo();
      },
    );
  }
}
