import 'package:flutter/material.dart';
import 'package:trackzyn/ui/record/widgets/activity/sessions/activity_sessions_view.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/resources/icons_library.dart';
import 'package:trackzyn/ui/shared/dashed_line.dart';
import 'package:trackzyn/ui/shared/icon_svg.dart';
import 'package:trackzyn/ui/shared/styles/shared_activity_card_box_decoration.dart';
import 'package:trackzyn/ui/shared/styles/shared_floating_title_text_style.dart';
import 'package:trackzyn/ui/utils/get_date_truncate.dart';
import 'package:trackzyn/ui/utils/get_relative_date_str.dart';
import 'package:trackzyn/ui/utils/get_time_by_date.dart';
import 'package:trackzyn/ui/utils/get_total_time_str.dart';

class ActivityHistory extends StatefulWidget {
  final int? taskId;
  final String? taskName;
  final String? projectName;
  final int sessionsCount;
  final int spentTimeInSec;
  final DateTime? date;
  final DateTime? startedAt;
  final bool showDate;
  final int tasksDoneThisDate;
  final int totalDurationThisDate;

  const ActivityHistory({
    super.key,
    this.taskId,
    this.taskName,
    this.projectName,
    this.sessionsCount = 0,
    this.spentTimeInSec = 0,
    this.date,
    this.startedAt,
    this.showDate = false,
    this.tasksDoneThisDate = 0,
    this.totalDurationThisDate = 0,
  });

  @override
  State<ActivityHistory> createState() => _ActivityHistoryState();
}

class _ActivityHistoryState extends State<ActivityHistory> {
  Widget _buildDate() {
    return Container(
      width: MediaQuery.of(context).size.width,
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Text(
            textAlign: TextAlign.left,
            widget.date != null
                ? getRelativeDate(widget.date!.toIso8601String())
                : '',
            style: sharedFloatingTitleTextStyle(),
          ),
          const SizedBox(width: 8),
          if (widget.tasksDoneThisDate > 0)
            Container(
              // padding: const EdgeInsets.symmetric(horizontal: 20),
              width: 20,
              height: 20,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: ColorPalette.neutral200,
                shape: BoxShape.circle,
              ),
              child: Text(
                '${widget.tasksDoneThisDate}',
                style: const TextStyle(
                  fontSize: 12,
                  color: ColorPalette.neutral700,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          Spacer(),
          if (widget.totalDurationThisDate > 0)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: Text(
                getTotalTimeStr(
                  widget.totalDurationThisDate,
                  showSeconds: false,
                ),
                style: const TextStyle(
                  fontSize: 14,
                  color: ColorPalette.neutral500,
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: MediaQuery.of(context).size.width * 0.5,
              child: Text(
                widget.taskName ?? 'No Task',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
                overflow: TextOverflow.visible,
                // softWrap: true,
              ),
            ),
            SizedBox(
              width: MediaQuery.of(context).size.width * 0.5,
              child: Text(
                widget.projectName ?? 'No Project',
                style: const TextStyle(
                  fontSize: 14,
                  color: ColorPalette.neutral600,
                ),
                overflow: TextOverflow.visible,
                // softWrap: true,
              ),
            ),
          ],
        ),
        Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                color: ColorPalette.neutral100,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                '${widget.sessionsCount}x session${widget.sessionsCount > 1 ? 's' : ''}',
                style: const TextStyle(
                  fontSize: 14,
                  color: ColorPalette.neutral500,
                ),
              ),
            ),
            const SizedBox(width: 4),
            Icon(
              Icons.chevron_right_rounded,
              color: ColorPalette.neutral400,
              size: 20,
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildFooter() {
    return Row(
      children: [
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
                  getTotalTimeStr(widget.spentTimeInSec, showSeconds: false),
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
              'Last at',
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
        const Spacer(),
        OutlinedButton(
          onPressed: () {},
          child: Row(
            children: const [
              SizedBox(width: 8),
              IconSvg(IconsLibrary.play_linear, size: 20),
              SizedBox(width: 8),
              Text('Start again'),
            ],
          ),
        ),
      ],
    );
  }

  void handleHistoryTapped() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder:
            (context) => ActivitySessionsView(
              taskName: widget.taskName,
              projectName: widget.projectName,
              sessionsCount: widget.sessionsCount,
              spentTimeInSec: widget.spentTimeInSec,
              taskId: widget.taskId,
              date:
                  widget.startedAt != null
                      ? getDateTruncate(widget.startedAt)
                      : getDateTruncate(DateTime.now()),
            ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        if (widget.showDate) _buildDate(),
        Container(
          width: MediaQuery.of(context).size.width,
          decoration: sharedActivityCardBoxDecoration(),
          margin: const EdgeInsets.only(bottom: 16),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              overlayColor: WidgetStateProperty.all<Color>(
                ColorPalette.neutral200.withValues(alpha: 0.75),
              ),
              borderRadius: BorderRadius.circular(20),
              onTap: () {
                handleHistoryTapped();
              },
              child: Ink(
                decoration: BoxDecoration(
                  color: Colors.transparent,
                  borderRadius: BorderRadius.circular(20),
                ),
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 12,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.start,
                  children: [_buildHeader(), DashedLine(), _buildFooter()],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
