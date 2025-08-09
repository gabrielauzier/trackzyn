import 'package:flutter/material.dart';

import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/shared/styles/shared_activity_card_box_decoration.dart';
import 'package:trackzyn/ui/utils/get_time_by_date.dart';
import 'package:trackzyn/ui/utils/get_total_time_str.dart';

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
  });

  @override
  State<ActivityBasic> createState() => _ActivityBasicState();
}

class _ActivityBasicState extends State<ActivityBasic> {
  Widget _buildFooter() {
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
            Text(
              'Started at',
              style: const TextStyle(
                fontSize: 14,
                color: ColorPalette.neutral500,
              ),
            ),
            Row(
              children: [
                Icon(
                  Icons.calendar_month_outlined,
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
            Text(
              'Total time',
              style: const TextStyle(
                fontSize: 14,
                color: ColorPalette.neutral500,
              ),
            ),
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
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.start,
              children: [_buildFooter()],
            ),
          ),
        ),
      ],
    );
  }
}
