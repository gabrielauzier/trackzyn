import 'package:flutter/material.dart';

import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/resources/icons_library.dart';
import 'package:trackzyn/ui/resources/illustrations_library.dart';
import 'package:trackzyn/ui/shared/icon_svg.dart';
import 'package:trackzyn/ui/shared/styles/shared_activity_card_box_decoration.dart';

class ProjectSquareCard extends StatelessWidget {
  final String? projectName;
  final int? taskCount;

  const ProjectSquareCard({super.key, this.projectName, this.taskCount});

  @override
  Widget build(BuildContext context) {
    return Container(
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
              IconButton(
                padding: const EdgeInsets.all(0.0),
                onPressed: () {},
                icon: IconSvg(
                  IconsLibrary.more_linear,
                  size: 20,
                  color: ColorPalette.neutral500,
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
            taskCount != null ? '$taskCount tasks' : 'No task',
            style: TextStyle(fontSize: 14, color: ColorPalette.neutral500),
          ),
        ],
      ),
    );
  }
}
