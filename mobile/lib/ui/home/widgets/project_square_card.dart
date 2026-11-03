import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'package:trackzyn/ui/project/widgets/detail_project_view.dart';
import 'package:trackzyn/ui/project/widgets/detail_project_viewmodel.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/resources/icons_library.dart';
import 'package:trackzyn/ui/resources/illustrations_library.dart';
import 'package:trackzyn/ui/shared/icon_svg.dart';
import 'package:trackzyn/ui/shared/styles/shared_activity_card_box_decoration.dart';
import 'package:trackzyn/ui/utils/get_plural_str.dart';

class ProjectSquareCard extends StatelessWidget {
  final int? taskCount;
  final int? projectId;
  final String? projectName;

  const ProjectSquareCard({
    super.key,
    this.taskCount,
    this.projectId,
    this.projectName,
  });

  _handleProjectCardTap(BuildContext context) {
    debugPrint('Project card tapped: $projectId');

    Navigator.of(context).push(
      MaterialPageRoute(
        builder:
            (context) => BlocProvider(
              create:
                  (context) =>
                      DetailProjectViewModel(context.read(), context.read()),
              child: DetailProjectView(projectId: projectId ?? 0),
            ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => _handleProjectCardTap(context),
      child: Container(
        padding: const EdgeInsets.all(16.0),
        decoration: sharedActivityCardBoxDecoration(),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min, // Adjust height to fit content
          children: [
            Row(
              children: [
                switch (projectName) {
                  null => IconSvg(IllustrationsLibrary.folderGrey, size: 40),
                  _ => IconSvg(IllustrationsLibrary.folderPurple, size: 40),
                },
                const Spacer(),
                SizedBox(
                  child: IconButton(
                    constraints: const BoxConstraints(
                      maxHeight: 40,
                      maxWidth: 40,
                    ),
                    padding: const EdgeInsets.all(0.0),
                    onPressed: () {},
                    icon: IconSvg(
                      IconsLibrary.more_linear,
                      size: 20,
                      color: ColorPalette.neutral500,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12.0),
            Text(
              projectName ?? 'No project',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: ColorPalette.neutral900,
              ),
            ),
            Text(
              taskCount != null
                  ? getPluralStr(taskCount, "task", "tasks", none: "No tasks")
                  : 'No task',
              style: TextStyle(fontSize: 14, color: ColorPalette.neutral500),
            ),
          ],
        ),
      ),
    );
  }
}
