import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:provider/provider.dart';

import 'package:trackzyn/ui/record/record_cubit.dart';
import 'package:trackzyn/ui/record/widgets/activity/activities_history_card.dart';
import 'package:trackzyn/ui/record/widgets/activity/activity_session_card.dart';
import 'package:trackzyn/ui/record/widgets/pomodoro/pomodoro_card.dart';

class RecordView extends StatefulWidget {
  const RecordView({super.key});

  @override
  State<RecordView> createState() => _RecordViewState();
}

class _RecordViewState extends State<RecordView> {
  late final cubit = Provider.of<RecordCubit>(context, listen: false);

  _buildPomodoroContent() {
    return SafeArea(
      child: Container(
        // width: MediaQuery.of(context).size.width,
        // height: MediaQuery.of(context).size.height,
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.start,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [const SizedBox(height: 20), PomodoroCard()],
        ),
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
    return BlocProvider(
      create: (context) => cubit,
      child: DefaultTabController(
        length: 2,
        child: Scaffold(
          appBar: AppBar(
            title: const Text('Record'),
            bottom: TabBar(
              tabs: [Tab(text: 'Pomodoro'), Tab(text: 'Activities')],
            ),
          ),
          body: TabBarView(
            children: [_buildPomodoroContent(), _buildActivitiesContent()],
          ),
        ),
      ),
    );
  }
}
