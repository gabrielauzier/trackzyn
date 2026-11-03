import 'package:flutter/material.dart';
import 'package:trackzyn/domain/models/activity.dart';

import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/utils/get_full_date_str.dart';
import 'package:trackzyn/ui/utils/get_hour_formatted.dart';

class PlaygroundAgenda extends StatefulWidget {
  const PlaygroundAgenda({super.key});

  @override
  State<PlaygroundAgenda> createState() => _PlaygroundAgendaState();
}

class _PlaygroundAgendaState extends State<PlaygroundAgenda> {
  final List<int> _hours = List.generate(24, (index) => index);

  final int _currentHourInMinutes =
      DateTime.now().hour * 60 + DateTime.now().minute;

  final double _currentTimeMinutes = DateTime.now().minute.toDouble();

  final double _itemHeight = 50.0; // Height of each agenda item

  DateTime selectedDay = DateTime.now(); // Format: 'YYYY-MM-DD'

  final _activities = [
    Activity(
      id: 0,
      taskId: 0,
      note: 'Activity #1',
      startedAt: DateTime.parse('2023-10-01 08:20:00'),
      durationInSeconds: 60 * 60 + 60 * 40, // 1h 20 min
    ),
    Activity(
      id: 0,
      taskId: 0,
      note: 'Activity #2',
      startedAt: DateTime.parse('2023-10-01 10:50:00'),
      durationInSeconds: 60 * 40, // 1h 20 min
    ),
    Activity(
      id: 0,
      taskId: 0,
      note: 'Activity #3',
      startedAt: DateTime.parse('2023-10-01 16:50:00'),
      durationInSeconds: 60 * 5, // 1h 20 min
    ),
    Activity(
      id: 0,
      taskId: 0,
      note: 'Activity #4',
      startedAt: DateTime.parse('2023-10-01 09:50:00'),
      durationInSeconds: 60 * 25, // 1h 20 min
    ),
  ];

  fromMinToPosition(double minute) {
    return (minute / 60) * _itemHeight;
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      // This is where you can initialize any data or state after the first frame is rendered
      debugPrint(
        'PlaygroundAgenda initialized with current hour in minutes: $_currentHourInMinutes',
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ColorPalette.neutral100,
      appBar: AppBar(
        title: Row(
          children: [
            const Text(
              'Agenda',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
            ),
            // AppBar Buttons Here
          ],
        ),
        bottom: _buildDayCarousel(),
      ),

      body: SingleChildScrollView(
        child: Stack(
          children: [
            Column(
              children:
                  _hours.map((hour) {
                    return _buildHourContainer(context, hour);
                  }).toList(),
            ),
            ..._activities.map((activity) {
              return _buildActivityContainer(context, activity);
            }),
          ],
        ),
      ),
    );
  }

  PreferredSize _buildDayCarousel() {
    return PreferredSize(
      preferredSize: const Size.fromHeight(100.0),
      child: Padding(
        padding: const EdgeInsets.only(bottom: 16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: 24.0,
                vertical: 8.0,
              ),
              child: Text(
                getFullDateStr(selectedDay),
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: List.generate(31, (index) {
                  final weekday = DateTime.now().add(
                    Duration(days: index - 18),
                  );

                  final isSelectedDay =
                      weekday.day == selectedDay.day &&
                      weekday.month == selectedDay.month &&
                      weekday.year == selectedDay.year;

                  return GestureDetector(
                    onTap: () {
                      debugPrint('Selected day: ${weekday.toIso8601String()}');
                      setState(() {
                        selectedDay = weekday;
                      });
                    },
                    child: Container(
                      margin: const EdgeInsets.symmetric(horizontal: 2.0),
                      width: 48,
                      height: 48,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color:
                            isSelectedDay
                                ? ColorPalette.violet700
                                : ColorPalette.neutral200,
                        shape: BoxShape.circle,
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            [
                              'Sun',
                              'Mon',
                              'Tue',
                              'Wed',
                              'Thu',
                              'Fri',
                              'Sat',
                            ][weekday.weekday % 7],
                            style: TextStyle(
                              fontSize: 12,
                              color:
                                  isSelectedDay
                                      ? Colors.white
                                      : ColorPalette.neutral700,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Text(
                            '${weekday.day}',
                            style: TextStyle(
                              fontSize: 12,
                              color:
                                  isSelectedDay
                                      ? Colors.white
                                      : ColorPalette.neutral700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Row _buildTick(double tickOffset) {
    return Row(
      children: [
        // Container(
        //   margin: EdgeInsets.only(top: tickOffset),
        //   width: 8,
        //   height: 8,
        //   decoration: BoxDecoration(
        //     color: ColorPalette.violet700,
        //     shape: BoxShape.circle,
        //   ),
        // ),
        Expanded(
          child: Container(
            margin: EdgeInsets.only(top: tickOffset),
            height: 0.75,
            padding: const EdgeInsets.all(8.0),
            color: ColorPalette.red700,
          ),
        ),
        // Divider(color: Colors.black, thickness: 3, height: 2),
      ],
    );
  }

  Row _buildHourContainer(BuildContext context, int hour) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: MediaQuery.of(context).size.width * 0.15,
          height: _itemHeight,
          alignment: Alignment.topCenter,
          child: Text(
            getHourFormatted(hour),
            style: TextStyle(fontSize: 12, color: ColorPalette.neutral600),
          ),
        ),
        SizedBox(
          width: MediaQuery.of(context).size.width * 0.85,
          child: Stack(
            children: [
              FractionallySizedBox(
                widthFactor: 1,
                child: Container(
                  height: _itemHeight,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    border: Border(
                      left: BorderSide(color: ColorPalette.neutral300),
                      right: BorderSide(color: ColorPalette.neutral300),
                      bottom: BorderSide(color: ColorPalette.neutral300),
                      // top: BorderSide(color: ColorPalette.neutral300),
                    ),
                    // borderRadius: const BorderRadius.only(
                    //   topLeft: Radius.circular(8.0),
                    //   bottomLeft: Radius.circular(8.0),
                    // ),
                  ),
                ),
              ),
              if (hour * 60 <= _currentHourInMinutes &&
                  (hour + 1) * 60 > _currentHourInMinutes) ...[
                _buildTick(_itemHeight * _currentTimeMinutes / 60),
              ],
              // if (activitiesInHour.isNotEmpty) ...[
              //   _buildActivityContainer(context, hour, activitiesInHour[0]),
              // ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildActivityContainer(BuildContext context, Activity activity) {
    int startTimeInMinutes =
        activity.startedAt.hour * 60 + activity.startedAt.minute;

    double durationInMinutes = activity.durationInSeconds / 60;

    double startPosition = fromMinToPosition(startTimeInMinutes.toDouble());

    // double endPosition = fromMinToPosition(startMinute + durationInMinutes);

    return Positioned.fromRect(
      rect: Rect.fromPoints(
        Offset(0, startPosition),
        Offset(
          MediaQuery.of(context).size.width,
          startPosition + fromMinToPosition(durationInMinutes),
        ),
      ),
      child: Align(
        alignment: Alignment.topRight,
        child: Container(
          // margin: EdgeInsets.only(top: startPosition),
          alignment: Alignment.topLeft,
          width: MediaQuery.of(context).size.width * 0.85,
          height: fromMinToPosition(durationInMinutes),
          padding: const EdgeInsets.all(8.0),
          decoration: BoxDecoration(
            color: ColorPalette.violet100.withValues(alpha: 0.4),
            border: Border(
              left: BorderSide(color: ColorPalette.violet700, width: 1.0),
              top: BorderSide(color: ColorPalette.violet700, width: 1.0),
              right: BorderSide(color: ColorPalette.violet700, width: 1.0),
              bottom: BorderSide(color: ColorPalette.violet700, width: 1.0),
            ),
          ),
          child: Text(
            '${activity.note} - ${activity.startedAt.hour}:${activity.startedAt.minute} (${activity.durationInSeconds ~/ 60} min)',
            style: TextStyle(color: ColorPalette.violet700),
          ),
        ),
      ),
    );
  }
}
