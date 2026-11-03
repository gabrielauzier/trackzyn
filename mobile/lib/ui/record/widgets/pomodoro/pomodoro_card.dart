import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:provider/provider.dart';

import 'package:trackzyn/ui/record/record_cubit.dart';
import 'package:trackzyn/ui/record/record_state.dart';
import 'package:trackzyn/ui/record/widgets/pomodoro/pomodoro_timer.dart';
import 'package:trackzyn/ui/record/widgets/working/what_are_you_working_on.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/resources/icons_library.dart';
import 'package:trackzyn/ui/shared/icon_svg.dart';
import 'package:trackzyn/ui/shared/sleek_card.dart';

class PomodoroCard extends StatefulWidget {
  const PomodoroCard({super.key});

  @override
  State<PomodoroCard> createState() => _PomodoroCardState();
}

class _PomodoroCardState extends State<PomodoroCard> {
  late final cubit = Provider.of<RecordCubit>(context, listen: false);

  Widget _buildHeader() {
    return WhatAreYouWorkingOn();
  }

  ButtonStyle _buttonStyle({bool active = false}) {
    return ButtonStyle(
      backgroundColor:
          active
              ? WidgetStateProperty.all<Color>(Colors.white)
              : WidgetStateProperty.all<Color>(Colors.transparent),
      foregroundColor: WidgetStateProperty.all<Color>(ColorPalette.neutral500),
      surfaceTintColor: WidgetStateProperty.all<Color>(Colors.white),
      overlayColor: WidgetStateProperty.all<Color>(Colors.white),
      // overlayColor: WidgetStateProperty.all<Color>(ColorPalette.violet100),
      // shadowColor: WidgetStateProperty.all<Color>(Colors.black),
    );
  }

  void _onPomodoroTypeChanged(PomodoroType type) {
    cubit.changePomodoroType(type);
  }

  Widget _buildPomodoroTypeTabs() {
    return FittedBox(
      child: Container(
        // width: MediaQuery.of(context).size.width,
        padding: const EdgeInsets.symmetric(horizontal: 6),
        decoration: BoxDecoration(
          color: ColorPalette.stone100,
          borderRadius: BorderRadius.circular(99),
        ),
        child: BlocBuilder<RecordCubit, RecordState>(
          builder: (context, state) {
            return Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                TextButton(
                  onPressed: () {
                    _onPomodoroTypeChanged(PomodoroType.focus);
                  },
                  style: _buttonStyle(
                    active: state.pomodoroType == PomodoroType.focus,
                  ),
                  child: Text(
                    'Focus',
                    style: TextStyle(
                      fontSize: 14,
                      color:
                          state.pomodoroType == PomodoroType.focus
                              ? ColorPalette.neutral800
                              : ColorPalette.neutral500,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                TextButton(
                  onPressed: () {
                    _onPomodoroTypeChanged(PomodoroType.shortBreak);
                  },
                  style: _buttonStyle(
                    active: state.pomodoroType == PomodoroType.shortBreak,
                  ),
                  child: Text(
                    'Short Break',
                    style: TextStyle(
                      fontSize: 14,
                      color:
                          state.pomodoroType == PomodoroType.shortBreak
                              ? ColorPalette.neutral800
                              : ColorPalette.neutral500,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                TextButton(
                  onPressed: () {
                    _onPomodoroTypeChanged(PomodoroType.longBreak);
                  },
                  style: _buttonStyle(
                    active: state.pomodoroType == PomodoroType.longBreak,
                  ),
                  child: Text(
                    'Long Break',
                    style: TextStyle(
                      fontSize: 14,
                      color:
                          state.pomodoroType == PomodoroType.longBreak
                              ? ColorPalette.neutral800
                              : ColorPalette.neutral500,
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildTimer() {
    return PomodoroTimer(diameter: 280);
  }

  Widget _buildActionButtonsList() {
    getStartButtonBackgroundColor(RecordingStatus status, PomodoroType type) {
      switch (type) {
        case PomodoroType.focus:
          switch (status) {
            case RecordingStatus.notStarted:
              return ColorPalette.violet500;
            case RecordingStatus.paused:
              return ColorPalette.amber500;
            default:
              return Colors.black;
          }
        case PomodoroType.shortBreak:
        case PomodoroType.longBreak:
          switch (status) {
            case RecordingStatus.notStarted:
              return ColorPalette.sky500;
            case RecordingStatus.paused:
              return ColorPalette.amber500;
            default:
              return Colors.black;
          }
      }
    }

    return BlocBuilder<RecordCubit, RecordState>(
      builder: (context, state) {
        var recordingStatus = cubit.statusByType(RecordingType.pomodoro);
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
                  style: IconButton.styleFrom(
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(99),
                    ),
                  ),
                  onPressed: () {},
                  icon: const IconSvg(IconsLibrary.music_linear),
                ),
              ),
              ElevatedButton(
                onPressed: () {
                  switch (recordingStatus) {
                    case RecordingStatus.notStarted:
                      cubit.startRecording(RecordingType.pomodoro);
                      break;
                    case RecordingStatus.recording:
                      cubit.pauseRecording();
                      break;
                    case RecordingStatus.paused:
                      cubit.resumeRecording();
                      break;
                    case RecordingStatus.stopped:
                    case RecordingStatus.finished:
                      cubit.stopRecording();
                      break;
                  }
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: getStartButtonBackgroundColor(
                    recordingStatus,
                    state.pomodoroType,
                  ),
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
                      switch (recordingStatus) {
                        RecordingStatus.notStarted => IconSvg(
                          IconsLibrary.play_linear,
                          color: Colors.white,
                        ),
                        RecordingStatus.recording => IconSvg(
                          IconsLibrary.pause_linear,
                          color: Colors.white,
                        ),
                        RecordingStatus.paused => IconSvg(
                          IconsLibrary.play_linear,
                          color: Colors.white,
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
                      switch (recordingStatus) {
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
                  style: IconButton.styleFrom(
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(99),
                    ),
                  ),
                  onPressed: () {},
                  icon: const IconSvg(IconsLibrary.maximize_3_linear),
                ),
              ),
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
                'Activity in progress',
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
            mainAxisSize: MainAxisSize.min,
            children: [
              _buildHeader(),
              const SizedBox(height: 20),
              _buildPomodoroTypeTabs(),
              const SizedBox(height: 20),
              _buildTimer(),
              const SizedBox(height: 20),
              _buildActionButtonsList(),
            ],
          ),
        ),
        BlocBuilder<RecordCubit, RecordState>(
          builder: (context, state) {
            if ((state.status == RecordingStatus.recording ||
                    state.status == RecordingStatus.paused) &&
                state.type != RecordingType.pomodoro) {
              return _buildOverlayBackground();
            }
            return const SizedBox.shrink();
          },
        ),
        BlocBuilder<RecordCubit, RecordState>(
          builder: (context, state) {
            if ((state.status == RecordingStatus.recording ||
                    state.status == RecordingStatus.paused) &&
                state.type != RecordingType.pomodoro) {
              return _buildOverlayText();
            }
            return const SizedBox.shrink();
          },
        ),
      ],
    );
  }
}
