import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:provider/provider.dart';
import 'package:trackzyn/ui/record/record_cubit.dart';
import 'package:trackzyn/ui/record/record_state.dart';
import 'package:trackzyn/ui/record/widgets/activity/activity_history.dart';
import 'package:trackzyn/ui/shared/sleek_card.dart';

class ActivitiesHistoryCard extends StatefulWidget {
  const ActivitiesHistoryCard({super.key});

  @override
  State<ActivitiesHistoryCard> createState() => _ActivitiesHistoryCardState();
}

class _ActivitiesHistoryCardState extends State<ActivitiesHistoryCard> {
  late final viewModel = Provider.of<RecordCubit>(context, listen: false);

  @override
  void initState() {
    super.initState();
    viewModel.getActivities();
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<RecordCubit, RecordState>(
      builder: (context, state) {
        return SleekCard(
          width: MediaQuery.of(context).size.width,
          // height: MediaQuery.of(context).size.height,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.start,
              crossAxisAlignment: CrossAxisAlignment.start,
              children:
                  state.activities.map((activity) {
                    return ActivityHistory(
                      // taskName: activity.taskName,
                      // projectName: activity.projectName,
                      // sessionsCount: activity.sessionsCount,
                      spentTimeInSec: activity.durationInSeconds,
                      date: activity.startedAt,
                    );
                  }).toList(),
            ),
          ),
        );
      },
    );
  }
}
