import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:provider/provider.dart';
import 'package:trackzyn/ui/record/record_cubit.dart';
import 'package:trackzyn/ui/record/record_state.dart';
import 'package:trackzyn/ui/record/widgets/dialogs/create_project_dialog.dart';
import 'package:trackzyn/ui/record/widgets/dialogs/create_task_dialog.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/shared/sleek_label.dart';
import 'package:trackzyn/ui/shared/sleek_select.dart';

class AssociateWorkingOn extends StatefulWidget {
  const AssociateWorkingOn({super.key});

  @override
  State<AssociateWorkingOn> createState() => _AssociateWorkingOnState();
}

class _AssociateWorkingOnState extends State<AssociateWorkingOn> {
  late final viewModel = Provider.of<RecordCubit>(context, listen: false);

  @override
  void initState() {
    super.initState();
    // Option 1: Future.microtask (current approach)
    Future.microtask(() {
      viewModel.getProjects();
    });

    // Option 2: WidgetsBinding.instance.addPostFrameCallback
    // WidgetsBinding.instance.addPostFrameCallback((_) {
    //   viewModel.getProjects();
    // });

    // Option 3: Future.delayed with zero duration
    // Future.delayed(Duration.zero, () {
    //   viewModel.getProjects();
    // });
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<RecordCubit, RecordState>(
      builder: (context, state) {
        return Container(
          height: MediaQuery.of(context).size.height * 0.6,
          padding: const EdgeInsets.all(16.0),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(16.0),
              topRight: Radius.circular(16.0),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.1),
                blurRadius: 10,
                offset: const Offset(0, -2),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 16.0),
                decoration: BoxDecoration(
                  color: Colors.grey[300],
                  borderRadius: BorderRadius.circular(2.0),
                ),
              ),
              Text(
                'Associate Working On',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 16.0),
              SleekLabel(
                text: 'Project associated',
                count: state.projectsCount,
              ),
              SleekSelect(
                selectedValue: state.projectId?.toString(),
                onChanged: (value) {
                  viewModel.assignProject(int.tryParse(value ?? ''));
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
                      side: BorderSide(
                        color: ColorPalette.neutral300,
                        width: 1.0,
                      ),
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
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              if (state.projectId != null) ...[
                const SizedBox(height: 16.0),
                SleekLabel(text: 'Task name', count: state.tasksCount),
                SleekSelect(
                  selectedValue: state.taskId?.toString(),
                  onChanged: (value) {
                    viewModel.assignTask(int.tryParse(value ?? ''));
                  },
                  items: [
                    DropdownMenuItem(
                      alignment: Alignment.centerLeft,
                      // value: null,
                      child: Text(
                        'No task assignee',
                        style: TextStyle(color: ColorPalette.neutral400),
                      ),
                    ),
                    ...state.tasks.map(
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
                        side: BorderSide(
                          color: ColorPalette.neutral300,
                          width: 1.0,
                        ),
                      ),
                      elevation: 0,
                    ),
                    onPressed:
                        state.projectId != null
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
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
              // SizedBox(height: MediaQuery.of(context).size.height * 0.4),
              // SizedBox(
              //   width: MediaQuery.of(context).size.width,
              //   child: ElevatedButton(
              //     style: ElevatedButton.styleFrom(
              //       padding: const EdgeInsets.symmetric(vertical: 12.0),
              //       backgroundColor: Colors.black,
              //       foregroundColor: Colors.white,
              //     ),
              //     onPressed: () {
              //       // Handle save action
              //     },
              //     child: const Text(
              //       'Create',
              //       style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
              //     ),
              //   ),
              // ),
              // const SizedBox(height: 8.0),
              // SizedBox(
              //   width: MediaQuery.of(context).size.width,
              //   child: OutlinedButton(
              //     style: ElevatedButton.styleFrom(
              //       padding: const EdgeInsets.symmetric(vertical: 12.0),
              //     ),
              //     onPressed: () {
              //       Navigator.of(context).pop(); // Close the sheet
              //     },
              //     child: const Text('Cancel', style: TextStyle(fontSize: 16)),
              //   ),
              // ),
              // const SizedBox(height: 48.0),
            ],
          ),
        );
      },
    );
  }
}
