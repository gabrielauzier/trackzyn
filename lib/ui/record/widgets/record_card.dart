import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'package:trackzyn/ui/record/record_cubit.dart';
import 'package:trackzyn/ui/record/record_state.dart';
import 'package:trackzyn/ui/record/widgets/record_timer.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/shared/sleek_card.dart';

class RecordCard extends StatefulWidget {
  const RecordCard({super.key});

  @override
  State<RecordCard> createState() => _RecordCardState();
}

class _RecordCardState extends State<RecordCard> {
  Widget _buildHeader() {
    return Container(
      width: MediaQuery.of(context).size.width,
      decoration: BoxDecoration(
        color: ColorPalette.stone100,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'No project assignee',
              style: TextStyle(fontSize: 16, color: ColorPalette.neutral700),
            ),
            const Text(
              'What are you working on?',
              style: TextStyle(
                fontSize: 18,
                color: ColorPalette.neutral800,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTimer() {
    return RecordTimer(diameter: 280);
  }

  Widget _buildActionButtonsList() {
    return BlocBuilder<RecordCubit, RecordState>(
      builder: (context, state) {
        return Padding(
          padding: const EdgeInsets.all(8.0),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: EdgeInsets.zero,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: ColorPalette.neutral200, width: 2),
                ),
                child: IconButton(
                  padding: EdgeInsets.zero,
                  onPressed: () {},
                  icon: const Icon(Icons.music_note),
                ),
              ),
              ElevatedButton(
                onPressed: () {
                  switch (state.status) {
                    case RecordingStatus.notStarted:
                      context.read<RecordCubit>().startRecording();
                      break;
                    case RecordingStatus.recording:
                      context.read<RecordCubit>().pauseRecording();
                      break;
                    case RecordingStatus.paused:
                      context.read<RecordCubit>().resumeRecording();
                      break;
                    case RecordingStatus.stopped:
                    case RecordingStatus.finished:
                      context.read<RecordCubit>().stopRecording();
                      break;
                  }
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: switch (state.status) {
                    RecordingStatus.notStarted => ColorPalette.violet500,
                    RecordingStatus.paused => ColorPalette.amber500,
                    _ => Colors.black,
                  },
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(24),
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 24,
                    vertical: 12,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      switch (state.status) {
                        RecordingStatus.notStarted => const Icon(
                          Icons.play_arrow,
                          color: Colors.white,
                          size: 24,
                        ),
                        RecordingStatus.recording => const Icon(
                          Icons.pause,
                          color: Colors.white,
                          size: 24,
                        ),
                        RecordingStatus.paused => const Icon(
                          Icons.play_arrow,
                          color: Colors.white,
                          size: 24,
                        ),
                        RecordingStatus.finished => const Icon(
                          Icons.refresh,
                          color: Colors.white,
                          size: 24,
                        ),
                        _ => const Icon(
                          Icons.stop,
                          color: Colors.white,
                          size: 24,
                        ),
                      },
                      const SizedBox(width: 8),
                      switch (state.status) {
                        RecordingStatus.notStarted => const Text(
                          'Start',
                          style: TextStyle(fontSize: 16),
                        ),
                        RecordingStatus.recording => const Text(
                          'Pause',
                          style: TextStyle(fontSize: 16),
                        ),
                        RecordingStatus.paused => const Text(
                          'Resume',
                          style: TextStyle(fontSize: 16),
                        ),
                        RecordingStatus.finished => const Text(
                          'Reset',
                          style: TextStyle(fontSize: 16),
                        ),
                        _ => const SizedBox.shrink(),
                      },
                    ],
                  ),
                ),
              ),
              Container(
                padding: EdgeInsets.zero,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: ColorPalette.neutral200, width: 2),
                ),
                child: IconButton(
                  padding: EdgeInsets.zero,
                  onPressed: () {},
                  icon: const Icon(Icons.zoom_out_map),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return SleekCard(
      width: MediaQuery.of(context).size.width,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildHeader(),
          const SizedBox(height: 20),
          _buildTimer(),
          const SizedBox(height: 20),
          _buildActionButtonsList(),
        ],
      ),
    );
  }
}
