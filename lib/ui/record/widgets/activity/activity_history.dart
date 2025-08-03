import 'package:flutter/material.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';

class ActivityHistory extends StatefulWidget {
  final String? taskName;
  final String? projectName;
  final int sessionsCount;
  final int spentTimeInSec;
  final DateTime? date;

  const ActivityHistory({
    super.key,
    this.taskName,
    this.projectName,
    this.sessionsCount = 0,
    this.spentTimeInSec = 0,
    this.date,
  });

  @override
  State<ActivityHistory> createState() => _ActivityHistoryState();
}

class _ActivityHistoryState extends State<ActivityHistory> {
  List<Widget> _buildHeader() {
    return [
      Text(
        widget.taskName ?? 'No Task',
        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      ),
      Text(
        widget.projectName ?? 'No Project',
        style: const TextStyle(fontSize: 14, color: ColorPalette.neutral600),
      ),
    ];
  }

  Widget _buildDashedLine() {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      child: LayoutBuilder(
        builder: (BuildContext context, BoxConstraints constraints) {
          return Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: List.generate(
              (constraints.maxWidth / 10).floor(),
              (index) => const SizedBox(
                width: 5,
                child: Divider(color: ColorPalette.neutral300, thickness: 1),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildFooter() {
    final hours = (widget.spentTimeInSec / 3600).floor();
    final minutes = ((widget.spentTimeInSec % 3600) / 60).floor();
    final seconds = widget.spentTimeInSec % 60;

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
                  '${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}',
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
                  widget.date != null
                      ? '${widget.date!.hour.toString().padLeft(2, '0')}:${widget.date!.minute.toString().padLeft(2, '0')}'
                      : '--:--',
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
              Icon(Icons.play_arrow_outlined, size: 24),
              SizedBox(width: 8),
              Text('Start again'),
            ],
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: MediaQuery.of(context).size.width,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: ColorPalette.neutral200, width: 1),
        boxShadow: [
          BoxShadow(
            color: ColorPalette.neutral100.withValues(alpha: 0.5),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      margin: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.start,
        children: [..._buildHeader(), _buildDashedLine(), _buildFooter()],
      ),
    );
  }
}
