import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:provider/provider.dart';

import 'package:trackzyn/ui/record/record_cubit.dart';
import 'package:trackzyn/ui/record/record_state.dart';
import 'package:trackzyn/ui/record/widgets/activity/sessions/activity_basic.dart';
import 'package:trackzyn/ui/record/widgets/sheets/export_report_sheet.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/resources/icons_library.dart';
import 'package:trackzyn/ui/shared/dashed_line.dart';
import 'package:trackzyn/ui/shared/icon_svg.dart';
import 'package:trackzyn/ui/shared/styles/shared_activity_card_box_decoration.dart';
import 'package:trackzyn/ui/shared/styles/shared_floating_title_text_style.dart';
import 'package:trackzyn/ui/shared/widgets/assigned_folder_icon.dart';
import 'package:trackzyn/ui/utils/get_date_truncate.dart';
import 'package:trackzyn/ui/utils/get_full_date_str.dart';
import 'package:trackzyn/ui/utils/get_total_time_str.dart';

class AllActivitySessionsByDayView extends StatefulWidget {
  final String? taskName;
  final String? projectName;
  final int sessionsCount;
  final int spentTimeInSec;
  final int? taskId;
  final DateTime date;

  const AllActivitySessionsByDayView({
    super.key,
    this.taskId,
    required this.date,
    this.taskName,
    this.projectName,
    this.sessionsCount = 1,
    this.spentTimeInSec = 0,
  });

  @override
  State<AllActivitySessionsByDayView> createState() =>
      _AllActivitySessionsByDayViewState();
}

class ProjectTemp {
  final int? id;
  final String name;
  int duration;

  ProjectTemp({this.id, required this.name, required this.duration});
}

class _AllActivitySessionsByDayViewState
    extends State<AllActivitySessionsByDayView> {
  late final viewModel = Provider.of<RecordCubit>(context, listen: false);

  Iterable<Padding> _buildProjectsList(
    Map<int, ProjectTemp> spentTimeByProject,
  ) {
    return spentTimeByProject.entries.map((entry) {
      final project = entry.value;
      bool isProjectAssigned = project.id != null;
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 6.0),
        child: Row(
          // mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            AssignedFolderIcon(isProjectAssigned),
            const SizedBox(width: 8),
            Text(
              project.name,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: ColorPalette.neutral900,
              ),
            ),
            const Spacer(),
            Text(
              getTotalTimeStr(project.duration, showSeconds: true),
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w400,
                color: ColorPalette.neutral600,
              ),
            ),
          ],
        ),
      );
    });
  }

  Widget _buildTotalUsedTimeCard() {
    return BlocBuilder<RecordCubit, RecordState>(
      builder: (context, state) {
        int totalTimeInSec = state.activities.fold<int>(
          0,
          (sum, activity) => sum + activity.durationInSeconds,
        );

        Map<int, ProjectTemp> spentTimeByProject = state.activities
            .fold<Map<int, ProjectTemp>>({}, (map, activity) {
              int? projectId = activity.projectId ?? -1;

              if (!map.containsKey(projectId)) {
                map[projectId] = ProjectTemp(
                  id: activity.projectId,
                  name: activity.projectName ?? 'No project',
                  duration: 0,
                );
              }

              map[projectId]?.duration += activity.durationInSeconds;

              return map;
            });

        int projectsCount = spentTimeByProject.length;

        return Container(
          width: MediaQuery.of(context).size.width,
          padding: const EdgeInsets.all(16),
          decoration: sharedActivityCardBoxDecoration(),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        getFullDateStr(widget.date),
                        style: TextStyle(
                          fontWeight: FontWeight.w400,
                          color: ColorPalette.neutral600,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'TIME SPENT',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w500,
                          color: ColorPalette.neutral600,
                        ),
                      ),
                      Text(
                        getTotalTimeStr(totalTimeInSec, showSeconds: true),
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
                      border: Border.all(
                        color: ColorPalette.neutral200,
                        width: 1,
                      ),
                    ),
                    child: Text(
                      '$projectsCount project${projectsCount > 1 ? 's' : ''}',
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
              const DashedLine(),
              ..._buildProjectsList(spentTimeByProject),
              const SizedBox(height: 16),
              OutlinedButton(
                onPressed: () {
                  handleExportTapped();
                },
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    IconSvg(IconsLibrary.export_square_linear, size: 20),
                    const SizedBox(width: 8),
                    Text('Export reports to'),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  void showStoragePermissionDeniedSnackBar() {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Storage permission is required to export reports.'),
      ),
    );
  }

  void handleExportTapped() {
    Future.microtask(() async {
      final status = await Permission.manageExternalStorage.request();
      final isPermanentlyDenied =
          await Permission.manageExternalStorage.isPermanentlyDenied;
      if (!status.isGranted) {
        showStoragePermissionDeniedSnackBar();
        if (isPermanentlyDenied) {
          openAppSettings();
        }
        return;
      }
    });

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => ExportReportSheet(),
    );
  }

  @override
  void initState() {
    super.initState();
    Future.microtask(() async {
      await viewModel.getActivitiesByDateOnly(
        date: getDateTruncate(widget.date),
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
                      variant: ActivityBasicViewType.withProject,
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
