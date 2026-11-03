import 'package:flutter/material.dart';
import 'package:trackzyn/ui/resources/illustrations_library.dart';
import 'package:trackzyn/ui/shared/icon_svg.dart';

class AssignedFolderIcon extends StatelessWidget {
  final bool isProjectAssigned;

  const AssignedFolderIcon(this.isProjectAssigned, {super.key});

  @override
  Widget build(BuildContext context) {
    if (isProjectAssigned) {
      return IconSvg(IllustrationsLibrary.folderPurple, size: 20);
    } else {
      return IconSvg(IllustrationsLibrary.folderGrey, size: 20);
    }
  }
}
