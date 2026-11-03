import 'package:flutter/material.dart';

import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/shared/styles/shared_activity_card_box_decoration.dart';
import 'package:trackzyn/ui/shared/widgets/assigned_folder_icon.dart';
import 'package:trackzyn/ui/utils/get_time_by_date.dart';
import 'package:trackzyn/ui/utils/get_total_time_str.dart';

enum ActivityBasicViewType { withoutProject, withProject }

class ActivityBasic extends StatefulWidget {
  final String? taskName;
  final String? projectName;
  final int sessionsCount;
  final int spentTimeInSec;
  final DateTime? date;
  final DateTime? startedAt;
  final bool showDate;
  final int tasksDoneThisDate;
  final int totalDurationThisDate;
  final int index;
  final ActivityBasicViewType? variant;

  const ActivityBasic({
    super.key,
    this.taskName,
    this.projectName,
    this.sessionsCount = 0,
    this.spentTimeInSec = 0,
    this.date,
    this.startedAt,
    this.showDate = false,
    this.tasksDoneThisDate = 0,
    this.totalDurationThisDate = 0,
    this.index = 0,
    this.variant = ActivityBasicViewType.withoutProject,
  });

  @override
  State<ActivityBasic> createState() => _ActivityBasicState();
}

class _ActivityBasicState extends State<ActivityBasic> {
  Widget _buildWidgetWithProjectInfo() {
    return Row(
      // mainAxisAlignment: MainAxisAlignment.spaceBetween,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Text(
          '#${widget.index + 1}',
          style: const TextStyle(fontSize: 14, color: ColorPalette.neutral500),
        ),
        const SizedBox(width: 16),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.access_time_rounded,
                  color: ColorPalette.neutral600,
                  size: 18,
                ),
                const SizedBox(width: 4),
                Text(
                  getTimeByDate(widget.startedAt),
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: ColorPalette.neutral600,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                Icon(
                  Icons.timer_outlined,
                  color: ColorPalette.neutral600,
                  size: 20,
                ),
                const SizedBox(width: 4),
                Text(
                  getTotalTimeStr(widget.spentTimeInSec, showSeconds: true),
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: ColorPalette.neutral600,
                  ),
                ),
              ],
            ),
          ],
        ),
        // Spacer(),
        const SizedBox(width: 16),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.taskName ?? 'No Task',
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
              overflow: TextOverflow.visible,
              // softWrap: true,
            ),
            const SizedBox(height: 4),
            SizedBox(
              // width: MediaQuery.of(context).size.width * 0.5,
              child: Row(
                children: [
                  AssignedFolderIcon(
                    widget.projectName != null && widget.projectName != '',
                  ),
                  const SizedBox(width: 6),
                  Text(
                    widget.projectName ?? 'No Project',
                    style: const TextStyle(
                      fontSize: 14,
                      color: ColorPalette.neutral600,
                    ),
                    overflow: TextOverflow.visible,
                    // softWrap: true,
                  ),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildWidgetWithoutProjectInfo() {
    return Row(
      children: [
        Text(
          '#${widget.index + 1}',
          style: const TextStyle(fontSize: 14, color: ColorPalette.neutral500),
        ),
        const SizedBox(width: 16),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Text(
            //   'Started at',
            //   style: const TextStyle(
            //     fontSize: 14,
            //     color: ColorPalette.neutral500,
            //   ),
            // ),
            Row(
              children: [
                Icon(
                  Icons.access_time_rounded,
                  color: ColorPalette.neutral900,
                  size: 20,
                ),
                const SizedBox(width: 4),
                Text(
                  getTimeByDate(widget.startedAt),
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: ColorPalette.neutral900,
                  ),
                ),
              ],
            ),
          ],
        ),
        const SizedBox(width: 16),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Text(
            //   'Total',
            //   style: const TextStyle(
            //     fontSize: 14,
            //     color: ColorPalette.neutral500,
            //   ),
            // ),
            Row(
              children: [
                Icon(
                  Icons.timer_outlined,
                  color: ColorPalette.neutral900,
                  size: 20,
                ),
                const SizedBox(width: 4),
                Text(
                  getTotalTimeStr(widget.spentTimeInSec, showSeconds: true),
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: ColorPalette.neutral900,
                  ),
                ),
              ],
            ),
          ],
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: MediaQuery.of(context).size.width,
          decoration: sharedActivityCardBoxDecoration(),
          margin: const EdgeInsets.only(bottom: 8),
          child: Container(
            decoration: BoxDecoration(
              color: Colors.transparent,
              borderRadius: BorderRadius.circular(20),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: switch (widget.variant) {
              ActivityBasicViewType.withProject =>
                _buildWidgetWithProjectInfo(),
              ActivityBasicViewType.withoutProject =>
                _buildWidgetWithoutProjectInfo(),
              null => SizedBox.shrink(),
            },
          ),
        ),
      ],
    );
  }
}
