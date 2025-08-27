import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:provider/provider.dart';

import 'package:trackzyn/domain/models/task.dart';
import 'package:trackzyn/ui/record/record_cubit.dart';
import 'package:trackzyn/ui/record/record_state.dart';
import 'package:trackzyn/ui/record/widgets/dialogs/create_project_dialog.dart';
import 'package:trackzyn/ui/record/widgets/dialogs/create_task_dialog.dart';
import 'package:trackzyn/ui/record/widgets/time/time_wheel.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/shared/dashed_line.dart';
import 'package:trackzyn/ui/shared/sleek_bottom_sheet.dart';
import 'package:trackzyn/ui/shared/sleek_label.dart';
import 'package:trackzyn/ui/shared/sleek_select.dart';
import 'package:trackzyn/ui/utils/date_compare.dart';
import 'package:trackzyn/ui/utils/get_full_date_str.dart';
import 'package:trackzyn/ui/utils/get_time_str.dart';
import 'package:trackzyn/ui/utils/get_total_time_str.dart';

class CreateActivityRecordSheet extends StatefulWidget {
  const CreateActivityRecordSheet({super.key});

  @override
  State<CreateActivityRecordSheet> createState() =>
      _CreateActivityRecordSheetState();
}

class _CreateActivityRecordSheetState extends State<CreateActivityRecordSheet> {
  late final viewModel = Provider.of<RecordCubit>(context, listen: false);

  final TextEditingController _noteController = TextEditingController();

  int? _projectId;
  int? _taskId;

  TimeOfDay _startTime = TimeOfDay.now();
  String _startTimeStr = getTimeStr(TimeOfDay.now());

  TimeOfDay _stopTime = TimeOfDay.now();
  String _stopTimeStr = getTimeStr(TimeOfDay.now());

  DateTime _startDate = DateTime.now();
  String _startDateStr = getFullDateStr(DateTime.now());

  DateTime _stopDate = DateTime.now();
  String _stopDateStr = getFullDateStr(DateTime.now());

  int _estimatedTimeHours = 0;
  int _estimatedTimeMinutes = 0;
  int _estimatedTimeSeconds = 0;

  int _totalEstimatedTimeInSec = 0;

  final _minimalDurationInSec = 60 * 5; // 5 minutes

  final Map<String, String?> _formErrors = {
    "time": null,
    "date": null,
    "duration": null,
  };

  List<Task> _tasks = [];

  List<Widget> _buildProject(RecordState state) {
    return [
      SleekLabel(text: 'Project associated', count: state.projectsCount),
      SleekSelect(
        selectedValue: _projectId?.toString(),
        onChanged: (value) {
          final projectId = int.tryParse(value ?? '');
          _loadProjectTasks(projectId);
          setState(() {
            _projectId = projectId;
            _taskId = null; // Reset taskId when project changes
          });
        },
        items: [
          DropdownMenuItem(
            alignment: Alignment.centerLeft,
            value: null,
            child: Text(
              'No project assignee',
              style: TextStyle(color: ColorPalette.neutral400),
            ),
          ),
          ...state.projects.map(
            (option) => DropdownMenuItem(
              alignment: Alignment.centerLeft,
              value: option.id.toString(),
              child: Text(option.name),
            ),
          ),
        ],
      ),
      SizedBox(
        width: MediaQuery.of(context).size.width,
        child: ElevatedButton(
          style: ElevatedButton.styleFrom(
            padding: const EdgeInsets.symmetric(
              vertical: 12.0,
              horizontal: 12.0,
            ),
            backgroundColor: ColorPalette.neutral100,
            foregroundColor: ColorPalette.neutral800,
            shape: RoundedRectangleBorder(
              borderRadius: const BorderRadius.only(
                bottomLeft: Radius.circular(8.0),
                bottomRight: Radius.circular(8.0),
              ),
              side: BorderSide(color: ColorPalette.neutral300, width: 1.0),
            ),
            elevation: 0,
          ),
          onPressed: () {
            showDialog(
              context: context,
              builder: (context) {
                return CreateProjectDialog();
              },
            );
          },
          child: Row(
            children: [
              Icon(Icons.add, color: ColorPalette.neutral800),
              const SizedBox(width: 8.0),
              const Text(
                'Create new project',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
              ),
            ],
          ),
        ),
      ),
    ];
  }

  List<Widget> _buildTask() {
    return [
      const SizedBox(height: 16.0),
      SleekLabel(text: 'Task name', count: _tasks.length),
      SleekSelect(
        selectedValue: _taskId?.toString(),
        onChanged: (value) {
          final taskId = int.tryParse(value ?? '');
          setState(() {
            _taskId = taskId;
          });
        },
        items: [
          DropdownMenuItem(
            alignment: Alignment.centerLeft,
            child: Text(
              'No task assignee',
              style: TextStyle(color: ColorPalette.neutral400),
            ),
          ),
          ..._tasks.map(
            (option) => DropdownMenuItem(
              alignment: Alignment.centerLeft,
              value: option.id.toString(),
              child: Text(option.name),
            ),
          ),
        ],
      ),
      SizedBox(
        width: MediaQuery.of(context).size.width,
        child: ElevatedButton(
          style: ElevatedButton.styleFrom(
            padding: const EdgeInsets.symmetric(
              vertical: 12.0,
              horizontal: 12.0,
            ),
            backgroundColor: ColorPalette.neutral100,
            foregroundColor: ColorPalette.neutral800,
            shape: RoundedRectangleBorder(
              borderRadius: const BorderRadius.only(
                bottomLeft: Radius.circular(8.0),
                bottomRight: Radius.circular(8.0),
              ),
              side: BorderSide(color: ColorPalette.neutral300, width: 1.0),
            ),
            elevation: 0,
          ),
          onPressed:
              _projectId != null
                  ? () {
                    showDialog(
                      context: context,
                      builder: (context) {
                        return CreateTaskDialog();
                      },
                    );
                  }
                  : null,
          child: Row(
            children: [
              Icon(Icons.add, color: ColorPalette.neutral800),
              const SizedBox(width: 8.0),
              const Text(
                'Create new task',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
              ),
            ],
          ),
        ),
      ),
    ];
  }

  List<Widget> _buildNote() {
    return [
      SleekLabel(text: 'Note'),
      TextField(
        maxLines: 3,
        controller: _noteController,
        decoration: InputDecoration(
          hintText: 'Enter note...',
          hintStyle: TextStyle(color: ColorPalette.neutral400),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12.0),
            borderSide: BorderSide(color: ColorPalette.neutral300),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12.0),
            borderSide: BorderSide(color: ColorPalette.violet600),
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12.0),
            borderSide: BorderSide(color: ColorPalette.neutral300),
          ),
        ),
        onChanged: (value) {
          // Handle note input change
        },
      ),
    ];
  }

  List<Widget> _buildEstimatedTime() {
    return [
      SleekLabel(text: 'Estimated time'),
      Container(
        decoration: BoxDecoration(
          border: Border.all(color: ColorPalette.neutral300),
          borderRadius: BorderRadius.circular(12.0),
        ),
        child: SizedBox(
          height: 200,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // ============ Hours box
              SizedBox(
                width: 100.0, // Set a fixed width for the TimeWheel
                child: TimeWheel(
                  range: 24,
                  onChanged: (value) {
                    setState(() {
                      _estimatedTimeHours = value;
                      _totalEstimatedTimeInSec =
                          (_estimatedTimeHours * 3600) +
                          (_estimatedTimeMinutes * 60) +
                          _estimatedTimeSeconds;

                      final startDateTime = DateTime(
                        _startDate.year,
                        _startDate.month,
                        _startDate.day,
                        _startTime.hour,
                        _startTime.minute,
                      );
                      final stopDateTime = startDateTime.add(
                        Duration(
                          hours: _estimatedTimeHours,
                          minutes: _estimatedTimeMinutes,
                          seconds: _estimatedTimeSeconds,
                        ),
                      );
                      _stopDate = stopDateTime;
                      _stopDateStr = getFullDateStr(stopDateTime);
                      _stopTime = TimeOfDay.fromDateTime(stopDateTime);
                      _stopTimeStr = getTimeStr(_stopTime);
                    });
                  },
                ),
              ),
              SizedBox(
                height: 150,
                child: Center(
                  child: Text(
                    ":",
                    style: TextStyle(fontSize: 32, fontWeight: FontWeight.bold),
                  ),
                ),
              ),
              // ============ Minutes box
              SizedBox(
                width: 100.0, // Set a fixed width for the TimeWheel
                child: TimeWheel(
                  range: 60,
                  onChanged: (value) {
                    setState(() {
                      _estimatedTimeMinutes = value;
                      _totalEstimatedTimeInSec =
                          (_estimatedTimeHours * 3600) +
                          (_estimatedTimeMinutes * 60) +
                          _estimatedTimeSeconds;

                      final startDateTime = DateTime(
                        _startDate.year,
                        _startDate.month,
                        _startDate.day,
                        _startTime.hour,
                        _startTime.minute,
                      );
                      final stopDateTime = startDateTime.add(
                        Duration(
                          hours: _estimatedTimeHours,
                          minutes: _estimatedTimeMinutes,
                          seconds: _estimatedTimeSeconds,
                        ),
                      );
                      _stopDate = stopDateTime;
                      _stopDateStr = getFullDateStr(stopDateTime);
                      _stopTime = TimeOfDay.fromDateTime(stopDateTime);
                      _stopTimeStr = getTimeStr(_stopTime);
                    });
                  },
                ),
              ),
              SizedBox(
                height: 150,
                child: Center(
                  child: Text(
                    ":",
                    style: TextStyle(fontSize: 32, fontWeight: FontWeight.bold),
                  ),
                ),
              ),
              // ============ Seconds box
              SizedBox(
                width: 100.0, // Set a fixed width for the TimeWheel
                child: TimeWheel(
                  range: 60,
                  onChanged: (value) {
                    setState(() {
                      _estimatedTimeSeconds = value;
                      _totalEstimatedTimeInSec =
                          (_estimatedTimeHours * 3600) +
                          (_estimatedTimeMinutes * 60) +
                          _estimatedTimeSeconds;

                      final startDateTime = DateTime(
                        _startDate.year,
                        _startDate.month,
                        _startDate.day,
                        _startTime.hour,
                        _startTime.minute,
                      );
                      final stopDateTime = startDateTime.add(
                        Duration(
                          hours: _estimatedTimeHours,
                          minutes: _estimatedTimeMinutes,
                          seconds: _estimatedTimeSeconds,
                        ),
                      );
                      _stopDate = stopDateTime;
                      _stopDateStr = getFullDateStr(stopDateTime);
                      _stopTime = TimeOfDay.fromDateTime(stopDateTime);
                      _stopTimeStr = getTimeStr(_stopTime);
                    });
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    ];
  }

  Row _buildStartStopTime() {
    return Row(
      children: [
        Expanded(
          child: Column(
            children: [
              SleekLabel(text: 'Start time'),
              SizedBox(
                width: MediaQuery.of(context).size.width,
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    side: BorderSide(color: ColorPalette.neutral300),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12.0),
                    ),
                  ),
                  onPressed: () async {
                    final selectedTime = await showTimePicker(
                      context: context,
                      initialTime: _startTime,
                    );

                    if (selectedTime != null) {
                      setState(() {
                        _startTime = selectedTime;
                        _startTimeStr = getTimeStr(selectedTime);
                      });

                      debugPrint(_startTimeStr);
                    }
                  },
                  child: Text(
                    _startTimeStr,
                    textAlign: TextAlign.start,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w400,
                      color: ColorPalette.neutral500,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 12.0),
        Expanded(
          child: Column(
            children: [
              SleekLabel(text: 'Stop time'),
              SizedBox(
                width: MediaQuery.of(context).size.width,
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    side: BorderSide(color: ColorPalette.neutral300),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12.0),
                    ),
                  ),
                  onPressed: () async {
                    final selectedTime = await showTimePicker(
                      context: context,
                      initialTime: _stopTime,
                    );

                    if (selectedTime != null) {
                      setState(() {
                        _stopTime = selectedTime;
                        _stopTimeStr = getTimeStr(selectedTime);
                      });

                      debugPrint(_stopTimeStr);
                    }
                  },
                  child: Text(
                    _stopTimeStr,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w400,
                      color: ColorPalette.neutral500,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Row _buildStartStopDate(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Column(
            children: [
              SleekLabel(text: 'Start date'),
              SizedBox(
                width: MediaQuery.of(context).size.width,
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    side: BorderSide(color: ColorPalette.neutral300),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12.0),
                    ),
                  ),
                  onPressed: () async {
                    final selectedDate = await showDatePicker(
                      context: context,
                      initialDate: DateTime.now(),
                      firstDate: DateTime(2000),
                      lastDate: DateTime(2100),
                    );

                    if (selectedDate != null) {
                      setState(() {
                        _startDate = selectedDate;
                        _startDateStr = getFullDateStr(selectedDate);
                      });

                      debugPrint(_startDateStr);
                    }
                  },
                  child: Text(
                    _startDateStr,
                    textAlign: TextAlign.start,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w400,
                      color: ColorPalette.neutral500,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),

        const SizedBox(width: 12.0),
        Expanded(
          child: Column(
            children: [
              SleekLabel(text: 'Stop time'),
              SizedBox(
                width: MediaQuery.of(context).size.width,
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    side: BorderSide(color: ColorPalette.neutral300),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12.0),
                    ),
                  ),
                  onPressed: () async {
                    final selectedDate = await showDatePicker(
                      context: context,
                      initialDate: DateTime.now(),
                      firstDate: DateTime(2000),
                      lastDate: DateTime(2100),
                    );

                    if (selectedDate != null) {
                      setState(() {
                        _stopDate = selectedDate;
                        _stopDateStr = getFullDateStr(selectedDate);
                      });

                      debugPrint(_stopDateStr);
                    }
                  },
                  child: Text(
                    _stopDateStr,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w400,
                      color: ColorPalette.neutral500,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Row _buildErrorInfo(String? message) {
    return Row(
      children: [
        Icon(Icons.error, color: Colors.red, size: 20),
        const SizedBox(width: 4.0),
        Expanded(
          child: Text(
            message ?? "There is an error in the form.",
            style: TextStyle(color: Colors.red, fontSize: 12),
          ),
        ),
      ],
    );
  }

  _onSuccess() {
    if (context.mounted) Navigator.of(context).pop();
  }

  _handleCreateActivity(VoidCallback onSuccess) async {
    if (_startDate.isAfter(_stopDate)) {
      setState(() {
        _formErrors["date"] = "Start date cannot be after stop date.";
      });
    } else {
      setState(() {
        _formErrors["date"] = null;
      });
    }

    if (_stopTime.isBefore(_startTime) && dateCompare(_startDate, _stopDate)) {
      setState(() {
        _formErrors["time"] = "Stop time cannot be before start time.";
      });
    } else {
      setState(() {
        _formErrors["time"] = null;
      });
    }

    if (_totalEstimatedTimeInSec < _minimalDurationInSec) {
      setState(() {
        _formErrors["duration"] =
            "Estimated time must be greater than ${getTotalTimeStr(_minimalDurationInSec)}";
      });
    } else {
      setState(() {
        _formErrors["duration"] = null;
      });
    }

    if (_formErrors.values.every((error) => error == null)) {
      final int? createdActivityId = await viewModel.addActivity(
        projectId: _projectId,
        taskId: _taskId,
        note: _noteController.text,
        durationInSeconds: _totalEstimatedTimeInSec,
        startedAt: DateTime(
          _startDate.year,
          _startDate.month,
          _startDate.day,
          _startTime.hour,
          _startTime.minute,
        ),
        finishedAt: DateTime(
          _stopDate.year,
          _stopDate.month,
          _stopDate.day,
          _stopTime.hour,
          _stopTime.minute,
        ),
      );

      if (createdActivityId != null) {
        onSuccess();
        return;
      }
    }
  }

  _loadProjectTasks(int? projectId) async {
    if (projectId != null) {
      final tasks = await viewModel.getProjectTasks(projectId);

      setState(() {
        _tasks = tasks;
      });
    } else {
      setState(() {
        _tasks = [];
        _taskId = null;
      });
    }
  }

  @override
  void initState() {
    super.initState();

    Future.microtask(() {
      viewModel.getProjects();
    });
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<RecordCubit, RecordState>(
      builder: (context, state) {
        return SleekBottomSheet(
          height: MediaQuery.of(context).size.height * 0.9,
          bottom: [
            SizedBox(
              width: MediaQuery.of(context).size.width,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 12.0),
                  backgroundColor: Colors.black,
                  foregroundColor: Colors.white,
                ),
                onPressed: () {
                  _handleCreateActivity(_onSuccess);
                },
                child: const Text(
                  'Create',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                ),
              ),
            ),
            SizedBox(
              width: MediaQuery.of(context).size.width,
              child: OutlinedButton(
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 12.0),
                ),
                onPressed: () {
                  Navigator.of(context).pop(); // Close the bottom sheet
                },
                child: const Text(
                  'Cancel',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                ),
              ),
            ),
          ],
          children: [
            Center(
              child: Text(
                'Create activity record',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
            ),
            const SizedBox(height: 16.0),
            ..._buildProject(state),
            if (_projectId != null) ..._buildTask(),
            const SizedBox(height: 16.0),
            ..._buildNote(),
            DashedLine(),
            ..._buildEstimatedTime(),

            if (_formErrors["duration"] != null)
              _buildErrorInfo(_formErrors["duration"]),

            const SizedBox(height: 16.0),
            _buildStartStopTime(),

            if (_formErrors["time"] != null)
              _buildErrorInfo(_formErrors["time"]),

            const SizedBox(height: 4.0),
            _buildStartStopDate(context),

            if (_formErrors["date"] != null)
              _buildErrorInfo(_formErrors["date"]),
          ],
        );
      },
    );
  }
}
