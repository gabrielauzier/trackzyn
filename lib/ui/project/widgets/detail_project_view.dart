import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:provider/provider.dart';

import 'package:trackzyn/ui/project/widgets/detail_project_state.dart';
import 'package:trackzyn/ui/project/widgets/detail_project_viewmodel.dart';
import 'package:trackzyn/ui/project/widgets/task_card.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/resources/icons_library.dart';
import 'package:trackzyn/ui/resources/illustrations_library.dart';
import 'package:trackzyn/ui/shared/icon_svg.dart';
import 'package:trackzyn/ui/shared/sleek_input.dart';

class DetailProjectView extends StatefulWidget {
  final int projectId;

  const DetailProjectView({super.key, this.projectId = 0});

  @override
  State<DetailProjectView> createState() => _DetailProjectViewState();
}

class _DetailProjectViewState extends State<DetailProjectView> {
  late final viewModel = Provider.of<DetailProjectViewModel>(
    context,
    listen: false,
  );

  final TextEditingController _searchTaskController = TextEditingController();

  Container _buildContainerBackground(BuildContext context, Widget child) {
    return Container(
      width: MediaQuery.of(context).size.width,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            ColorPalette.neutral100,
            ColorPalette.violet100.withValues(alpha: 0.5),
            ColorPalette.violet200.withValues(alpha: 0.75),
          ],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: child,
    );
  }

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      viewModel.loadProjectDetails(widget.projectId);
      viewModel.loadProjectTasks(widget.projectId);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        // toolbarHeight: 144.0,
        backgroundColor: ColorPalette.neutral100,
        scrolledUnderElevation: 0.0,
        titleSpacing: 0,
        automaticallyImplyLeading: false,
        title: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8.0),
          child: Row(
            children: [
              IconButton(
                icon: IconSvg(IconsLibrary.arrow_left_linear),
                constraints: BoxConstraints(minWidth: 48.0, minHeight: 48.0),
                onPressed: () {
                  Navigator.of(context).pop();
                },
              ),

              Expanded(
                child: SizedBox(
                  width: 120.0,
                  child: Text(
                    'Project Details',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w500,
                      color: ColorPalette.neutral800,
                    ),
                  ),
                ),
              ),

              SizedBox(width: 48.0),
            ],
          ),
        ),

        bottom: PreferredSize(
          preferredSize: Size.fromHeight(90),
          child: BlocBuilder<DetailProjectViewModel, DetailProjectState>(
            builder: (context, state) {
              return _buildContainerBackground(
                context,
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20.0,
                    vertical: 24.0,
                  ),
                  child: Row(
                    children: [
                      IconSvg(IllustrationsLibrary.folderPurple, size: 48),
                      const SizedBox(width: 16),
                      Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Align(
                            alignment: Alignment.centerLeft,
                            child: Text(
                              state.project?.name ?? 'Project Name',
                              style: TextStyle(
                                fontSize: 22,
                                fontWeight: FontWeight.w600,
                                color: ColorPalette.neutral900,
                              ),
                            ),
                          ),
                          const SizedBox(height: 4),
                          Align(
                            alignment: Alignment.centerLeft,
                            child: Text(
                              '${state.tasks.length} tasks ', // TODO: • 3h 20m tracked count
                              style: TextStyle(
                                fontSize: 14,
                                color: ColorPalette.neutral600,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ),
      body: BlocBuilder<DetailProjectViewModel, DetailProjectState>(
        builder: (context, state) {
          return Column(
            // padding: const EdgeInsets.only(top: 16.0, left: 16.0, right: 16.0),
            children: [
              const SizedBox(height: 6.0),
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16.0,
                  vertical: 6.0,
                ),
                child: SleekInput(
                  controller: _searchTaskController,
                  hintText: 'Search task',
                  onSubmitted: (value) {},
                  prefixIcon: Padding(
                    padding: const EdgeInsets.only(
                      left: 12.0,
                      top: 16,
                      bottom: 16,
                    ),
                    child: IconSvg(
                      IconsLibrary.search_normal_linear,
                      color: Colors.black,
                      size: 24,
                    ),
                  ),
                ),
              ),
              Expanded(
                child: ListView.builder(
                  shrinkWrap: true,
                  physics: BouncingScrollPhysics(),
                  itemCount: state.tasks.length,
                  itemBuilder: (context, index) {
                    final task = state.tasks[index];

                    return Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16.0,
                        vertical: 6.0,
                      ),
                      child: TaskCard(
                        name: task.name,
                        description: task.description,
                        totalDurationInSeconds:
                            task.totalDurationInSeconds ?? 0,
                      ),
                    );
                  },
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
