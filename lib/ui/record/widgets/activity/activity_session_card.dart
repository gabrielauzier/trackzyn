import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:trackzyn/ui/record/record_cubit.dart';
import 'package:trackzyn/ui/record/record_state.dart';
import 'package:trackzyn/ui/record/widgets/activity/activity_timer.dart';
import 'package:trackzyn/ui/record/widgets/sheets/associate_working_on.dart';
import 'package:trackzyn/ui/record/widgets/working/what_are_you_working_on.dart';

import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/shared/sleek_card.dart';

class ActivitySessionCard extends StatefulWidget {
  const ActivitySessionCard({super.key});

  @override
  State<ActivitySessionCard> createState() => _ActivitySessionCardState();
}

class _ActivitySessionCardState extends State<ActivitySessionCard> {
  Widget _buildHeader() {
    return WhatAreYouWorkingOn();
  }

  Widget _buildTimer() {
    return ActivityTimer();
  }

  Widget _buildStartButton() {
    return ElevatedButton(
      onPressed: () {
        context.read<RecordCubit>().startRecording(RecordingType.activity);
      },
      style: ElevatedButton.styleFrom(
        backgroundColor: ColorPalette.violet500,
        foregroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.play_arrow, color: Colors.white, size: 24),
            const SizedBox(width: 8),
            const Text('Start session', style: TextStyle(fontSize: 16)),
          ],
        ),
      ),
    );
  }

  _buildStopButton() {
    return OutlinedButton(
      onPressed: () {
        context.read<RecordCubit>().stopRecording(completed: true);
      },
      style: OutlinedButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 20,
            height: 20,
            decoration: BoxDecoration(
              shape: BoxShape.rectangle,
              color: ColorPalette.red500,
              borderRadius: BorderRadius.circular(6),
            ),
          ),
          SizedBox(width: 8),
          Text(
            'Stop',
            style: TextStyle(fontSize: 16, color: ColorPalette.red500),
          ),
        ],
      ),
    );
  }

  _buildPauseButton() {
    var cubit = BlocProvider.of<RecordCubit>(context);
    var recordingStatus = cubit.statusByType(RecordingType.activity);

    return ElevatedButton(
      onPressed: () {
        switch (recordingStatus) {
          // Resume
          case RecordingStatus.paused:
            cubit.resumeRecording();
            break;
          // Pause
          default:
            cubit.pauseRecording();
            break;
        }
      },
      style: ElevatedButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
        backgroundColor: switch (recordingStatus) {
          // Resume
          RecordingStatus.paused => ColorPalette.amber500,
          // Pause
          _ => Colors.black,
        },
        foregroundColor: Colors.white,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          switch (recordingStatus) {
            // Resume
            RecordingStatus.paused => const Icon(Icons.play_arrow),
            // Pause
            _ => const Icon(Icons.pause),
          },
          const SizedBox(width: 8),
          switch (recordingStatus) {
            // Resume
            RecordingStatus.paused => const Text(
              'Resume',
              style: TextStyle(fontSize: 16),
            ),
            // Pause
            _ => const Text('Pause', style: TextStyle(fontSize: 16)),
          },
        ],
      ),
    );
  }

  Widget _buildActionButtonsList() {
    return BlocBuilder<RecordCubit, RecordState>(
      builder: (context, state) {
        var recordingStatus = BlocProvider.of<RecordCubit>(
          context,
        ).statusByType(RecordingType.activity);

        return Padding(
          padding: const EdgeInsets.all(8.0),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (recordingStatus == RecordingStatus.notStarted)
                _buildStartButton(),
              if (recordingStatus != RecordingStatus.notStarted) ...[
                _buildStopButton(),
                const SizedBox(width: 8),
                _buildPauseButton(),
              ],

              // ElevatedButton(
              //   onPressed: () {
              //     context.read<RecordCubit>().startRecording(
              //       RecordingType.activity,
              //     );
              //   },
              //   style: ElevatedButton.styleFrom(
              //     backgroundColor: ColorPalette.violet500,
              //     foregroundColor: Colors.white,
              //     shape: RoundedRectangleBorder(
              //       borderRadius: BorderRadius.circular(24),
              //     ),
              //   ),
              //   child: Padding(
              //     padding: const EdgeInsets.symmetric(
              //       horizontal: 24,
              //       vertical: 12,
              //     ),
              //     child: Row(
              //       mainAxisSize: MainAxisSize.min,
              //       children: [
              //         const Icon(
              //           Icons.play_arrow,
              //           color: Colors.white,
              //           size: 24,
              //         ),
              //         const SizedBox(width: 8),
              //         const Text(
              //           'Start session',
              //           style: TextStyle(fontSize: 16),
              //         ),
              //       ],
              //     ),
              //   ),
              // ),
              // ElevatedButton(
              //   onPressed: () {},
              //   style: ElevatedButton.styleFrom(
              //     backgroundColor: ColorPalette.neutral200,
              //     foregroundColor: ColorPalette.neutral800,
              //   ),
              //   child: const Text('Stop'),
              // ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildOverlayBackground() {
    return Positioned.fill(
      child: Container(
        decoration: BoxDecoration(
          color: ColorPalette.neutral600.withValues(alpha: 0.25),
          borderRadius: BorderRadius.circular(20),
        ),
      ),
    );
  }

  Widget _buildOverlayText() {
    return Positioned.fill(
      child: Center(
        child: BlocBuilder<RecordCubit, RecordState>(
          builder: (context, state) {
            return Container(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              decoration: BoxDecoration(
                color: ColorPalette.neutral50,
                borderRadius: BorderRadius.circular(99),
              ),
              child: Text(
                'Pomodoro in progress',
                style: const TextStyle(
                  fontSize: 24,
                  color: ColorPalette.red600,
                  fontWeight: FontWeight.bold,
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        SleekCard(
          width: MediaQuery.of(context).size.width,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.start,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 8),
              Center(
                child: Text(
                  'Time your activity',
                  style: TextStyle(
                    fontSize: 20,
                    color: ColorPalette.neutral900,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const SizedBox(height: 10),
              _buildHeader(),
              const SizedBox(height: 24),
              _buildTimer(),
              const SizedBox(height: 12),
              _buildActionButtonsList(),
            ],
          ),
        ),
        BlocBuilder<RecordCubit, RecordState>(
          builder: (context, state) {
            if ((state.status == RecordingStatus.recording ||
                    state.status == RecordingStatus.paused) &&
                state.type != RecordingType.activity) {
              return _buildOverlayBackground();
            }
            return const SizedBox.shrink();
          },
        ),
        BlocBuilder<RecordCubit, RecordState>(
          builder: (context, state) {
            if ((state.status == RecordingStatus.recording ||
                    state.status == RecordingStatus.paused) &&
                state.type != RecordingType.activity) {
              return _buildOverlayText();
            }
            return const SizedBox.shrink();
          },
        ),
      ],
    );
  }
}
