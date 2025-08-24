import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:provider/provider.dart';

import 'package:trackzyn/ui/home/home_state.dart';
import 'package:trackzyn/ui/home/home_viewmodel.dart';
import 'package:trackzyn/ui/home/widgets/project_square_card.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/shared/sleek_card.dart';

class AllProjectsContainer extends StatefulWidget {
  const AllProjectsContainer({super.key});

  @override
  State<AllProjectsContainer> createState() => _AllProjectsContainerState();
}

class _AllProjectsContainerState extends State<AllProjectsContainer> {
  final _projectItemWidthFactor = 0.5;

  final _scrollController = ScrollController();

  late final viewModel = Provider.of<HomeViewModel>(context, listen: false);

  @override
  void initState() {
    super.initState();

    Future.microtask(() async {
      await viewModel.loadProjects();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
      child: SleekCard(
        width: MediaQuery.of(context).size.width,
        padding: const EdgeInsets.symmetric(vertical: 4.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min, // Adjust height to fit content
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'All projects',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: ColorPalette.neutral900,
                  ),
                ),
                Container(
                  margin: const EdgeInsets.only(right: 8.0),
                  child: Text(
                    'View all',
                    style: TextStyle(
                      fontSize: 14,
                      color: ColorPalette.neutral500,
                      fontWeight: FontWeight.w400,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8.0),
            BlocBuilder<HomeViewModel, HomeState>(
              builder: (context, state) {
                return SizedBox(
                  height: 276.0,
                  child: Scrollbar(
                    controller: _scrollController,
                    thumbVisibility: true,
                    thickness: 4.0,
                    child: SingleChildScrollView(
                      controller: _scrollController,
                      primary:
                          false, // Disable primary scrolling to avoid conflicts with parent scroll
                      child: Wrap(
                        runSpacing: 8.0,
                        children: [
                          ...state.projects.asMap().entries.map((entry) {
                            final index = entry.key;
                            final project = entry.value;

                            return FractionallySizedBox(
                              widthFactor: _projectItemWidthFactor,
                              child: Container(
                                padding: EdgeInsets.only(right: 8.0),
                                child: ProjectSquareCard(
                                  key: ValueKey('project_$index'),
                                  projectName: project.name,
                                  taskCount: project.taskCount,
                                ),
                              ),
                            );
                          }),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
