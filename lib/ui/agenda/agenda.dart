import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:provider/provider.dart';

import 'package:trackzyn/domain/models/activity.dart';
import 'package:trackzyn/ui/agenda/agenda_state.dart';
import 'package:trackzyn/ui/agenda/agenda_viewmodel.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/resources/icons_library.dart';
import 'package:trackzyn/ui/shared/icon_svg.dart';
import 'package:trackzyn/ui/utils/get_full_date_str.dart';
import 'package:trackzyn/ui/utils/get_hour_formatted.dart';

class Agenda extends StatefulWidget {
  const Agenda({super.key});

  @override
  State<Agenda> createState() => _AgendaState();
}

class _AgendaState extends State<Agenda> {
  late final viewModel = Provider.of<AgendaViewModel>(context, listen: false);

  final List<int> _hours = List.generate(24, (index) => index);

  final int _currentHourInMinutes =
      DateTime.now().hour * 60 + DateTime.now().minute;

  final double _currentTimeMinutes = DateTime.now().minute.toDouble();

  double _itemHeight = 100.0; // Height of each agenda item

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

    Future.microtask(() {
      viewModel.loadActivities();
    });

    var hoursNow = DateTime.now().hour;

    scrollController = ScrollController(
      initialScrollOffset:
          _itemHeight * hoursNow, // or whatever offset you wish
      keepScrollOffset: true,
    );
  }

  late ScrollController scrollController;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ColorPalette.neutral100,
      appBar: AppBar(
        scrolledUnderElevation: 0.0,
        title: Row(
          children: [
            const Text(
              'Agenda',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
            ),
            // AppBar Buttons Here
            Spacer(),
            IconButton(
              icon: IconSvg(IconsLibrary.search_zoom_out_outline, size: 28),
              onPressed: () {
                setState(() {
                  if (_itemHeight >= 50) {
                    _itemHeight -= 25.0;
                  }
                });
                debugPrint('Add button pressed');
              },
            ),
            IconButton(
              icon: IconSvg(IconsLibrary.search_zoom_in_outline, size: 28),
              onPressed: () {
                setState(() {
                  if (_itemHeight <= 200) {
                    _itemHeight += 25.0;
                  }
                });
                debugPrint('Settings button pressed');
              },
            ),
          ],
        ),
        bottom: _buildDayCarousel(),
      ),

      body: SingleChildScrollView(
        controller: scrollController,
        child: BlocBuilder<AgendaViewModel, AgendaState>(
          builder: (context, state) {
            return Stack(
              children: [
                Column(
                  children:
                      _hours.map((hour) {
                        return _buildHourContainer(context, hour, state);
                      }).toList(),
                ),
                ...state.activities.map((activity) {
                  return _buildActivityContainer(context, activity);
                }),
              ],
            );
          },
        ),
      ),
    );
  }

  PreferredSize _buildDayCarousel() {
    return PreferredSize(
      preferredSize: const Size.fromHeight(100.0),
      child: BlocBuilder<AgendaViewModel, AgendaState>(
        builder: (context, state) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16.0,
                    vertical: 8.0,
                  ),
                  child: Text(
                    getFullDateStr(state.selectedDay),
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 12.0),
                  child: Row(
                    children: List.generate(31, (index) {
                      final weekday = DateTime.now().add(
                        Duration(days: index - 18),
                      );

                      final isSelectedDay =
                          weekday.day == state.selectedDay.day &&
                          weekday.month == state.selectedDay.month &&
                          weekday.year == state.selectedDay.year;

                      return GestureDetector(
                        onTap: () {
                          debugPrint(
                            'Selected day: ${weekday.toIso8601String()}',
                          );
                          viewModel.loadActivities(selectedDay: weekday);
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
          );
        },
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
            height: 1,
            padding: const EdgeInsets.all(8.0),
            color: ColorPalette.red700,
          ),
        ),
        // Divider(color: Colors.black, thickness: 3, height: 2),
      ],
    );
  }

  Row _buildHourContainer(BuildContext context, int hour, AgendaState state) {
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
                  (hour + 1) * 60 > _currentHourInMinutes &&
                  state.selectedToday) ...[
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
          padding: const EdgeInsets.symmetric(horizontal: 8.0),
          decoration: BoxDecoration(
            color: ColorPalette.violet100.withValues(alpha: 0.4),
            border: Border(
              left: BorderSide(color: ColorPalette.violet700, width: 1.0),
              top: BorderSide(color: ColorPalette.violet700, width: 1.0),
              right: BorderSide(color: ColorPalette.violet700, width: 1.0),
              bottom: BorderSide(color: ColorPalette.violet700, width: 1.0),
            ),
            borderRadius: BorderRadius.circular(4.0),
          ),
          child: Text(
            '${activity.taskName ?? 'No task'} - ${activity.startedAt.hour}:${activity.startedAt.minute} (${activity.durationInSeconds ~/ 60} min)',
            style: TextStyle(color: ColorPalette.violet700, fontSize: 10),
          ),
        ),
      ),
    );
  }
}
