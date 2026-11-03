import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:provider/provider.dart';
import 'package:trackzyn/ui/record/record_cubit.dart';
import 'package:trackzyn/ui/record/record_state.dart';
import 'package:trackzyn/ui/record/widgets/activity/activity_history.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/resources/icons_library.dart';
import 'package:trackzyn/ui/shared/icon_svg.dart';
import 'package:trackzyn/ui/shared/sleek_card.dart';
import 'package:trackzyn/ui/shared/sleek_input.dart';

class ActivitiesHistoryCard extends StatefulWidget {
  const ActivitiesHistoryCard({super.key});

  @override
  State<ActivitiesHistoryCard> createState() => _ActivitiesHistoryCardState();
}

class _ActivitiesHistoryCardState extends State<ActivitiesHistoryCard> {
  late final viewModel = Provider.of<RecordCubit>(context, listen: false);

  final TextEditingController _searchActivityController =
      TextEditingController();

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      viewModel.getActivities();
    });
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<RecordCubit, RecordState>(
      builder: (context, state) {
        Map<String, int> tasksQtdByDate = state.taskActivityGroups
            .fold<Map<String, int>>({}, (map, taskActivityGroup) {
              map[taskActivityGroup.activityDate] =
                  (map[taskActivityGroup.activityDate] ?? 0) + 1;
              return map;
            });

        Map<String, int> totalDurationByDate = state.taskActivityGroups
            .fold<Map<String, int>>({}, (map, taskActivityGroup) {
              map[taskActivityGroup.activityDate] =
                  (map[taskActivityGroup.activityDate] ?? 0) +
                  taskActivityGroup.totalDurationInSeconds;
              return map;
            });

        return SleekCard(
          width: MediaQuery.of(context).size.width,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.start,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SleekInput(
                  controller: _searchActivityController,
                  hintText: 'Search activity',
                  onSubmitted: (value) {
                    viewModel.getActivities(taskName: value);
                  },
                  prefixIcon: Padding(
                    padding: const EdgeInsets.only(
                      left: 12.0,
                      top: 16,
                      bottom: 16,
                    ),
                    child: IconSvg(
                      IconsLibrary.search_normal_linear,
                      color: ColorPalette.neutral800,
                      size: 20,
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                ...state.taskActivityGroups.asMap().entries.map((entry) {
                  final index = entry.key;
                  final taskActivityGroup = entry.value;
                  return ActivityHistory(
                    taskId: taskActivityGroup.taskId,
                    taskName: taskActivityGroup.taskName,
                    projectId: taskActivityGroup.projectId,
                    projectName: taskActivityGroup.projectName,
                    sessionsCount: taskActivityGroup.activityCount,
                    spentTimeInSec: taskActivityGroup.totalDurationInSeconds,

                    date: DateTime.parse(taskActivityGroup.activityDate),
                    tasksDoneThisDate:
                        tasksQtdByDate[taskActivityGroup.activityDate] ?? 0,
                    totalDurationThisDate:
                        totalDurationByDate[taskActivityGroup.activityDate] ??
                        0,
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
                }),
              ],
            ),
          ),
        );
      },
    );
  }
}
