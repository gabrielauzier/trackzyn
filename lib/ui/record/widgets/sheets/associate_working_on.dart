import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:provider/provider.dart';

import 'package:trackzyn/ui/record/record_cubit.dart';
import 'package:trackzyn/ui/record/record_state.dart';
import 'package:trackzyn/ui/record/widgets/dialogs/create_project_dialog.dart';
import 'package:trackzyn/ui/record/widgets/dialogs/create_task_dialog.dart';
import 'package:trackzyn/ui/record/widgets/sheets/selects/select_project_popup_menu.dart';
import 'package:trackzyn/ui/record/widgets/sheets/selects/select_task_popup_menu.dart';
import 'package:trackzyn/ui/shared/sleek_bottom_sheet.dart';
import 'package:trackzyn/ui/shared/sleek_label.dart';

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
        return SleekBottomSheet(
          height: MediaQuery.of(context).size.height * 0.6,
          bottom: [],
          children: [
            Center(
              child: Text(
                'Associate Working On',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
            ),
            const SizedBox(height: 16.0),
            SleekLabel(text: 'Project associated', count: state.projectsCount),
            _buildProjectsSelect(context, state),
            if (state.projectId != null) ...[
              const SizedBox(height: 16.0),
              SleekLabel(text: 'Task name', count: state.tasksCount),
              _buildTasksSelect(context, state),
            ],
          ],
        );
      },
    );
  }

  Widget _buildProjectsSelect(BuildContext context, RecordState state) {
    return SelectProjectPopupMenu(
      projects: state.projects,
      projectId: state.projectId,
      projectName: state.projectName,
      onSelected: (value) {
        if (value == 'New') {
          showDialog(
            context: context,
            builder: (context) {
              return CreateProjectDialog();
            },
          );
          return;
        }

        final projectId = int.tryParse(value);

        viewModel.assignProject(projectId);
      },
    );
  }

  Widget _buildTasksSelect(BuildContext context, RecordState state) {
    return SelectTaskPopupMenu(
      projectId: state.projectId,
      taskId: state.taskId,
      taskName: state.taskName,
      tasks: state.tasks,
      onSelected: (value) {
        if (value == 'New') {
          showDialog(
            context: context,
            builder: (context) {
              return CreateTaskDialog();
            },
          );
          return;
        }

        viewModel.assignTask(value.isNotEmpty ? int.tryParse(value) : null);
      },
    );
  }
}
