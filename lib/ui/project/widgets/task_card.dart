import 'package:flutter/material.dart';
import 'package:trackzyn/ui/record/widgets/arc.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/shared/dashed_line.dart';
import 'package:trackzyn/ui/shared/styles/shared_activity_card_box_decoration.dart';
import 'package:trackzyn/ui/utils/get_total_time_str.dart';

class TaskCard extends StatefulWidget {
  final String? name;
  final String? description;
  final List<String>? tags;
  final bool isMarkedAsCompleted;
  final String? projectName;

  final int totalDurationInSeconds;
  final int subtasksDone;
  final int substasksTotal;

  const TaskCard({
    super.key,
    this.name,
    this.description,
    this.tags,
    this.isMarkedAsCompleted = false,
    this.projectName,
    this.subtasksDone = 0,
    this.substasksTotal = 0,
    this.totalDurationInSeconds = 0,
  });

  @override
  State<TaskCard> createState() => _TaskCardState();
}

class _TaskCardState extends State<TaskCard> {
  bool _markedAsCompleted = false;

  _toggleMarkedAsCompleted() {
    debugPrint('Toggling marked as completed');
    setState(() {
      _markedAsCompleted = !_markedAsCompleted;
    });
  }

  @override
  void initState() {
    super.initState();
    setState(() {
      _markedAsCompleted = widget.isMarkedAsCompleted;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16.0),
      decoration: sharedActivityCardBoxDecoration(),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            onTap: _toggleMarkedAsCompleted,
            child: Container(
              width: 20,
              height: 20,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color:
                      _markedAsCompleted
                          ? ColorPalette.green700
                          : ColorPalette.neutral500,
                  width: 1.0,
                ),
              ),
              child: Icon(
                Icons.check,
                color:
                    _markedAsCompleted
                        ? ColorPalette.green700
                        : ColorPalette.neutral500,
                size: 16.0,
              ),
            ),
          ),
          const SizedBox(width: 16.0),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.name ?? 'No task',
                  style: TextStyle(
                    fontSize: 14.0,
                    fontWeight: FontWeight.bold,
                    color:
                        _markedAsCompleted
                            ? ColorPalette.green700
                            : ColorPalette.neutral800,
                    decoration:
                        _markedAsCompleted ? TextDecoration.lineThrough : null,
                  ),
                ),
                if (widget.description != null &&
                    widget.description!.isNotEmpty)
                  Text(
                    widget.description ?? 'Blank description',
                    style: TextStyle(
                      fontSize: 12.0,
                      color: ColorPalette.neutral500,
                    ),
                  ),

                DashedLine(),
                Row(
                  children: [
                    Text(
                      widget.substasksTotal > 0
                          ? '${widget.subtasksDone} of ${widget.substasksTotal} subtasks'
                          : 'No subtasks',
                      style: TextStyle(
                        fontSize: 12.0,
                        color: ColorPalette.neutral500,
                      ),
                    ),
                    const SizedBox(width: 4.0),
                    Text(
                      '• ${getTotalTimeStr(widget.totalDurationInSeconds, showSeconds: true)}',
                      style: TextStyle(
                        fontSize: 12.0,
                        color: ColorPalette.neutral500,
                      ),
                    ),
                    Spacer(),
                    if (widget.substasksTotal > 0) ...[
                      Stack(
                        children: [
                          Arc(
                            color: ColorPalette.neutral200,
                            diameter: 16,
                            progress: 1,
                            strokeWidth: 2.0,
                          ),
                          Arc(
                            color: ColorPalette.green600,
                            diameter: 16,
                            progress: 0.75,
                            strokeWidth: 2.0,
                          ),
                        ],
                      ),
                      SizedBox(width: 6),
                      Text(
                        '75%',
                        style: TextStyle(
                          fontSize: 12.0,
                          color: ColorPalette.neutral500,
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
