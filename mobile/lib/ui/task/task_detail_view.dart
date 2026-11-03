import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:provider/provider.dart';
import 'package:trackzyn/domain/enums/task_priority.dart';
import 'package:trackzyn/domain/enums/task_status.dart';
import 'package:trackzyn/domain/enums/viewmodel_status.dart';
import 'package:trackzyn/domain/models/task.dart';
import 'package:trackzyn/ui/project/widgets/detail_project_viewmodel.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/resources/icons_library.dart';
import 'package:trackzyn/ui/resources/illustrations_library.dart';
import 'package:trackzyn/ui/shared/dashed_line.dart';
import 'package:trackzyn/ui/shared/icon_svg.dart';
import 'package:trackzyn/ui/shared/styles/shared_activity_card_box_decoration.dart';
import 'package:trackzyn/ui/task/task_detail_state.dart';
import 'package:trackzyn/ui/task/task_detail_viewmodel.dart';
import 'package:trackzyn/ui/task/widgets/selects/select_priority_popup_menu.dart';
import 'package:trackzyn/ui/task/widgets/selects/select_project_popup_menu_smaller.dart';
import 'package:trackzyn/ui/task/widgets/selects/select_task_status_popup_menu.dart';
import 'package:trackzyn/ui/utils/get_full_date_str.dart';

class TaskDetailView extends StatefulWidget {
  final int taskId;
  final int? projectId;

  const TaskDetailView({
    super.key,
    required this.taskId,
    required this.projectId,
  });

  @override
  State<TaskDetailView> createState() => _TaskDetailViewState();
}

class _TaskDetailViewState extends State<TaskDetailView> {
  late final viewModel = Provider.of<TaskDetailViewModel>(
    context,
    listen: false,
  );

  late final projectViewModel = Provider.of<DetailProjectViewModel>(
    context,
    listen: false,
  );

  late final TextEditingController _descriptionController =
      TextEditingController();

  // Sub-widgets
  Widget _buildDetailRow({
    required String icon,
    required String label,
    Widget? child,
  }) {
    return SizedBox(
      height: 40.0,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          SizedBox(
            width: 128.0,
            child: Row(
              children: [
                IconSvg(icon, size: 20.0, color: ColorPalette.neutral600),
                const SizedBox(width: 8.0),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 14.0,
                    fontWeight: FontWeight.w500,
                    color: ColorPalette.neutral600,
                  ),
                ),
              ],
            ),
          ),
          child ?? const SizedBox.shrink(),
        ],
      ),
    );
  }

  Widget _buildProjectsSelect(BuildContext context, TaskDetailState state) {
    var currentProjectId = state.task?.projectId;
    var currentProjectName =
        state.projects
            .where((project) => project.id == currentProjectId)
            .firstOrNull
            ?.name;

    return SelectProjectPopupMenuSmaller(
      projects: state.projects,
      projectId: currentProjectId,
      projectName: currentProjectName,
      onSelected: (value) {
        viewModel.updateTaskField(
          state.task?.copyWith(projectId: int.tryParse(value)),
        );
      },
    );
  }

  // Methods
  Timer? _debounce;
  _onTextAreaChanged(String value, TaskDetailState state) {
    if (_debounce?.isActive ?? false) _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 500), () {
      viewModel.updateTaskField(state.task?.copyWith(description: value));
    });
  }

  _handleSaveChanges() async {
    bool success = await viewModel.saveChanges();
    if (success && mounted) {
      Navigator.of(context).pop(true);
    }
  }

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      viewModel.getTask(widget.taskId, (task) {
        _descriptionController.text = task.description ?? '';
      });
      viewModel.getProjects();
    });

    // _descriptionController.addListener(() {
    //   final text = _descriptionController.text;
    //   viewModel.updateTask(viewModel.state.task?.copyWith(description: text));
    // });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.white,
        leading: IconButton(
          constraints: const BoxConstraints(
            minWidth: 40,
            minHeight: 40,
            maxHeight: 40,
            maxWidth: 40,
          ),
          icon: const IconSvg(IconsLibrary.arrow_left_linear),
          onPressed: () {
            Navigator.of(context).pop();
          },
        ),
        scrolledUnderElevation: 0.0,
      ),
      body: SafeArea(
        child: Container(
          width: MediaQuery.of(context).size.width,
          decoration: const BoxDecoration(
            color: Colors.white,
            border: Border(
              top: BorderSide(color: ColorPalette.neutral200, width: 1.0),
            ),
          ),
          child: BlocBuilder<TaskDetailViewModel, TaskDetailState>(
            builder: (context, state) {
              if (state.status == ViewModelStatus.loading) {
                return const Center(child: CircularProgressIndicator());
              }

              if (state.status == ViewModelStatus.error) {
                return Padding(
                  padding: const EdgeInsets.all(24.0),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      IconSvg(
                        IllustrationsLibrary.notFound,
                        size: MediaQuery.of(context).size.width * 0.5,
                      ),
                      const SizedBox(height: 16.0),
                      Text(
                        'Error',
                        style: TextStyle(
                          fontSize: 24.0,
                          color: ColorPalette.zinc900,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 8.0),
                      Text(
                        state.errorMessage ?? 'An unexpected error occurred.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 16.0,
                          color: ColorPalette.zinc500,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                );
              }

              if (state.status == ViewModelStatus.loaded) {
                return Column(
                  children: [
                    Expanded(
                      child: ListView(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16.0,
                          vertical: 24.0,
                        ),
                        children: [
                          Text(
                            state.task?.name ?? '---',
                            style: TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.w600,
                              color: ColorPalette.neutral800,
                            ),
                          ),
                          const SizedBox(height: 16.0),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 16.0,
                              vertical: 8.0,
                            ),
                            decoration: sharedActivityCardBoxDecoration(),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                _buildDetailRow(
                                  icon: IconsLibrary.status_linear,
                                  label: 'Status',
                                  child: IntrinsicWidth(
                                    child: BlocBuilder<
                                      TaskDetailViewModel,
                                      TaskDetailState
                                    >(
                                      builder: (context, state) {
                                        return SelectTaskStatusPopupMenu(
                                          status:
                                              state.task?.status ??
                                              TaskStatus.notStarted,
                                          onSelected: (value) {
                                            viewModel.updateTaskField(
                                              state.task?.copyWith(
                                                status: value,
                                              ),
                                            );
                                          },
                                        );
                                      },
                                    ),
                                  ),
                                ),
                                DashedLine(marginZero: true),
                                _buildDetailRow(
                                  icon: IconsLibrary.flag_linear,
                                  label: 'Priority',
                                  child: SelectPriorityPopupMenu(
                                    status:
                                        state.task?.priority ??
                                        TaskPriority.low,
                                    onSelected: (value) {
                                      viewModel.updateTaskField(
                                        state.task?.copyWith(priority: value),
                                      );
                                    },
                                  ),
                                ),
                                DashedLine(marginZero: true),
                                _buildDetailRow(
                                  icon: IconsLibrary.calendar_add_linear,
                                  label: 'Created at',
                                  child: Text(
                                    state.task?.createdAt != null
                                        ? getFullDateStr(
                                          state.task?.createdAt as DateTime,
                                          withTime: true,
                                        )
                                        : '---',
                                    style: TextStyle(
                                      fontSize: 14.0,
                                      fontWeight: FontWeight.w500,
                                      color: ColorPalette.neutral800,
                                    ),
                                  ),
                                ),
                                DashedLine(marginZero: true),
                                _buildDetailRow(
                                  icon: IconsLibrary.calendar_add_linear,
                                  label: 'Due date',
                                  child: Text(
                                    state.task?.dueDate != null
                                        ? getFullDateStr(
                                          state.task?.dueDate as DateTime,
                                          withTime: true,
                                        )
                                        : '---',
                                    style: TextStyle(
                                      fontSize: 14.0,
                                      fontWeight: FontWeight.w500,
                                      color: ColorPalette.neutral800,
                                    ),
                                  ),
                                ),
                                DashedLine(marginZero: true),
                                _buildDetailRow(
                                  icon: IconsLibrary.folder_2_linear,
                                  label: 'Project',
                                  child: IntrinsicWidth(
                                    // width: 220.0,
                                    child: _buildProjectsSelect(context, state),
                                  ),
                                ),
                                DashedLine(marginZero: true),
                                _buildDetailRow(
                                  icon: IconsLibrary.note_linear,
                                  label: 'Description',
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 12.0,
                                  ),
                                  decoration: BoxDecoration(
                                    color: ColorPalette.neutral50,
                                    borderRadius: BorderRadius.circular(12.0),
                                    border: Border.all(
                                      color: ColorPalette.neutral300,
                                      width: 1.0,
                                    ),
                                  ),
                                  child: TextField(
                                    maxLines: null,
                                    decoration: InputDecoration(
                                      hintText: 'Enter description...',
                                      hintStyle: TextStyle(
                                        fontSize: 14.0,
                                        color: ColorPalette.neutral500,
                                      ),
                                      fillColor: Colors.amber,
                                      border: InputBorder.none,
                                    ),
                                    style: TextStyle(
                                      fontSize: 14.0,
                                      color: ColorPalette.neutral800,
                                    ),
                                    onChanged: (value) {
                                      if (value.isEmpty) {
                                        viewModel.resetTaskDescription();
                                      } else {
                                        viewModel.updateTaskField(
                                          state.task?.copyWith(
                                            description: value,
                                          ),
                                        );
                                      }
                                    },
                                    controller: _descriptionController,
                                  ),
                                ),
                                const SizedBox(height: 8.0),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        spacing: 12.0,
                        children: [
                          SizedBox(
                            width: MediaQuery.of(context).size.width,
                            child: ElevatedButton(
                              style: ElevatedButton.styleFrom(
                                padding: const EdgeInsets.symmetric(
                                  vertical: 12.0,
                                ),
                                backgroundColor: Colors.black,
                                foregroundColor: Colors.white,
                              ),
                              onPressed:
                                  viewModel.hasUnsavedChanges
                                      ? () {
                                        _handleSaveChanges();
                                      }
                                      : null,
                              child: const Text(
                                'Save',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ),
                          SizedBox(
                            width: MediaQuery.of(context).size.width,
                            child: OutlinedButton(
                              style: ElevatedButton.styleFrom(
                                padding: const EdgeInsets.symmetric(
                                  vertical: 12.0,
                                ),
                              ),
                              onPressed: () {
                                Navigator.of(
                                  context,
                                ).pop(false); // Close the bottom sheet
                              },
                              child: const Text(
                                'Cancel',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w600,
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

              return const SizedBox.shrink();
            },
          ),
        ),
      ),
    );
  }
}
