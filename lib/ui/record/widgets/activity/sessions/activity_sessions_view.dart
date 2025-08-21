import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:provider/provider.dart';

import 'package:trackzyn/ui/record/record_cubit.dart';
import 'package:trackzyn/ui/record/record_state.dart';
import 'package:trackzyn/ui/record/widgets/activity/sessions/activity_basic.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/resources/icons_library.dart';
import 'package:trackzyn/ui/shared/dashed_line.dart';
import 'package:trackzyn/ui/shared/icon_svg.dart';
import 'package:trackzyn/ui/shared/styles/shared_activity_card_box_decoration.dart';
import 'package:trackzyn/ui/shared/styles/shared_floating_title_text_style.dart';
import 'package:trackzyn/ui/shared/widgets/assigned_folder_icon.dart';
import 'package:trackzyn/ui/utils/get_relative_date_str.dart';
import 'package:trackzyn/ui/utils/get_total_time_str.dart';

class ActivitySessionsView extends StatefulWidget {
  final String? taskName;
  final String? projectName;
  final int sessionsCount;
  final int spentTimeInSec;
  final int? taskId;
  final String date;

  const ActivitySessionsView({
    super.key,
    this.taskId,
    required this.date,
    this.taskName,
    this.projectName,
    this.sessionsCount = 1,
    this.spentTimeInSec = 0,
  });

  @override
  State<ActivitySessionsView> createState() => _ActivitySessionsViewState();
}

class _ActivitySessionsViewState extends State<ActivitySessionsView> {
  late final viewModel = Provider.of<RecordCubit>(context, listen: false);

  Widget _buildTotalUsedTimeCard() {
    return Container(
      width: MediaQuery.of(context).size.width,
      padding: const EdgeInsets.all(16),
      decoration: sharedActivityCardBoxDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              AssignedFolderIcon(
                widget.projectName != null && widget.projectName != '',
              ),
              const SizedBox(width: 6),
              Text(
                widget.projectName ?? 'No project assigned',
                style: TextStyle(color: ColorPalette.neutral600),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            widget.taskName ?? 'No task assigned',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w600,
              color: ColorPalette.neutral900,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            getRelativeDate(widget.date),
            style: TextStyle(
              fontWeight: FontWeight.w400,
              color: ColorPalette.neutral600,
            ),
          ),
          DashedLine(),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'TIME SPENT',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w500,
                      color: ColorPalette.neutral600,
                    ),
                  ),
                  Text(
                    getTotalTimeStr(widget.spentTimeInSec, showSeconds: true),
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: ColorPalette.neutral900,
                    ),
                  ),
                ],
              ),
              const Spacer(),
              Container(
                // width: 60,
                // height: ,
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: ColorPalette.neutral100,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: ColorPalette.neutral200, width: 1),
                ),
                child: Text(
                  '${widget.sessionsCount} session${widget.sessionsCount > 1 ? 's' : ''}',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w400,
                    color: ColorPalette.neutral600,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // OutlinedButton(
          //   onPressed: () {},
          //   child: Row(
          //     mainAxisAlignment: MainAxisAlignment.center,
          //     children: [
          //       IconSvg(IconsLibrary.export_square_linear, size: 20),
          //       const SizedBox(width: 8),
          //       Text('Export report'),
          //     ],
          //   ),
          // ),
        ],
      ),
    );
  }

  @override
  void initState() {
    super.initState();
    Future.microtask(() async {
      await viewModel.getActivitiesByTaskAndDate(
        date: widget.date,
        taskId: widget.taskId,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        leading: IconButton(
          icon: const IconSvg(IconsLibrary.arrow_left_linear),
          onPressed: () {
            Navigator.of(context).pop();
          },
        ),
      ),
      body: Container(
        width: MediaQuery.of(context).size.width,
        decoration: const BoxDecoration(
          border: Border(
            top: BorderSide(color: ColorPalette.neutral200, width: 1.0),
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          child: BlocBuilder<RecordCubit, RecordState>(
            builder: (context, state) {
              return ListView(
                children: [
                  Text(
                    'Total used time',
                    style: sharedFloatingTitleTextStyle(),
                  ),
                  const SizedBox(height: 8),
                  _buildTotalUsedTimeCard(),
                  const SizedBox(height: 24),
                  Text('Sessions', style: sharedFloatingTitleTextStyle()),
                  const SizedBox(height: 8),
                  ...state.activities.asMap().entries.map((entry) {
                    final index = state.activities.length - 1 - entry.key;
                    final activity = entry.value;
                    return ActivityBasic(
                      key: ValueKey(index),
                      index: index,
                      taskName: activity.taskName,
                      projectName: activity.projectName,
                      startedAt: activity.startedAt,
                      spentTimeInSec: activity.durationInSeconds,
                      date: activity.startedAt,
                    );
                  }),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}
