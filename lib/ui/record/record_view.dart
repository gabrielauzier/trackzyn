import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/resources/icons_library.dart';
import 'package:trackzyn/ui/shared/icon_svg.dart';
import 'package:trackzyn/ui/record/record_cubit.dart';
import 'package:trackzyn/ui/record/widgets/activity/activities_history_card.dart';
import 'package:trackzyn/ui/record/widgets/activity/activity_session_card.dart';
import 'package:trackzyn/ui/record/widgets/pomodoro/pomodoro_card.dart';

class RecordView extends StatefulWidget {
  const RecordView({super.key});

  @override
  State<RecordView> createState() => _RecordViewState();
}

class _RecordViewState extends State<RecordView> with WidgetsBindingObserver {
  late final cubit = Provider.of<RecordCubit>(context, listen: false);

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.resumed:
        // App is visible and running
        debugPrint(
          '✅ App resumed ${DateTime.now()}. Current time recorded = ${cubit.pomodoroCurrentTimeInSec}/${cubit.activityCurrentTimeInSec}',
        );
        break;
      case AppLifecycleState.inactive:
        // App is temporarily inactive (e.g., notification shade down)
        debugPrint(
          '🫥 App inactive ${DateTime.now()}. Current time recorded = ${cubit.pomodoroCurrentTimeInSec}/${cubit.activityCurrentTimeInSec}',
        );
        break;
      case AppLifecycleState.paused:
        // App is in the background
        debugPrint(
          '⏸️ App paused ${DateTime.now()}. Current time recorded = ${cubit.pomodoroCurrentTimeInSec}/${cubit.activityCurrentTimeInSec}',
        );
        break;
      case AppLifecycleState.detached:
        // App is detached from the engine
        debugPrint(
          '❌ App detached ${DateTime.now()}. Current time recorded = ${cubit.pomodoroCurrentTimeInSec}/${cubit.activityCurrentTimeInSec}',
        );
        break;
      case AppLifecycleState.hidden:
        // All views of the application are hidden
        debugPrint(
          '🙈 App hidden ${DateTime.now()}. Current time recorded = ${cubit.pomodoroCurrentTimeInSec}/${cubit.activityCurrentTimeInSec}',
        );
        break;
    }
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  _buildPomodoroContent() {
    return Container(
      // width: MediaQuery.of(context).size.width,
      // height: MediaQuery.of(context).size.height,
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [const SizedBox(height: 20), PomodoroCard()],
      ),
    );
  }

  _buildActivitiesContent() {
    return ListView(
      // mainAxisAlignment: MainAxisAlignment.start,
      // crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        const SizedBox(height: 20),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          margin: const EdgeInsets.only(bottom: 24),
          child: ActivitySessionCard(),
        ),
        ActivitiesHistoryCard(),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    WakelockPlus.enable();
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        backgroundColor: ColorPalette.neutral50,
        appBar: AppBar(
          title: Row(
            children: [
              const Text(
                'Record',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
              ),
              Spacer(),
              IconButton(
                icon: IconSvg(IconsLibrary.add_square_linear, size: 28),
                onPressed: () {
                  debugPrint('Add button pressed');
                },
              ),
              IconButton(
                icon: IconSvg(IconsLibrary.setting_2_linear, size: 28),
                onPressed: () {
                  debugPrint('Settings button pressed');
                },
              ),
            ],
          ),
          bottom: TabBar(
            tabs: [Tab(text: 'Pomodoro'), Tab(text: 'Activities')],
          ),
        ),
        body: TabBarView(
          children: [_buildPomodoroContent(), _buildActivitiesContent()],
        ),
      ),
    );
  }
}
