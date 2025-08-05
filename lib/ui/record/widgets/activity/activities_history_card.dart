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
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.start,
              crossAxisAlignment: CrossAxisAlignment.start,
              children:
                  state.taskActivityGroups.asMap().entries.map((entry) {
                    final index = entry.key;
                    final taskActivityGroup = entry.value;
                    return ActivityHistory(
                      taskName: taskActivityGroup.taskName,
                      projectName: taskActivityGroup.projectName,
                      sessionsCount: taskActivityGroup.activityCount,
                      spentTimeInSec: taskActivityGroup.totalDurationInSeconds,
                      date: DateTime.parse(taskActivityGroup.activityDate),
                      startedAt:
                          taskActivityGroup.startedAt != null
                              ? DateTime.parse(taskActivityGroup.startedAt!)
                              : null,
                      showDate:
                          index == 0 ||
                          taskActivityGroup.activityDate !=
                              state
                                  .taskActivityGroups[index - 1]
                                  .activityDate, // Show date only for the first item or when the date changes
                    );
                  }).toList(),
            ),
          ),
        );
      },
    );
  }
}
