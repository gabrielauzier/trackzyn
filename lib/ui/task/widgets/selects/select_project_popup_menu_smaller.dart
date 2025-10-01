import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:trackzyn/domain/models/project.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/resources/icons_library.dart';
import 'package:trackzyn/ui/resources/illustrations_library.dart';
import 'package:trackzyn/ui/shared/icon_svg.dart';
import 'package:trackzyn/ui/shared/sleek_popup_menu_item.dart';

class SelectProjectPopupMenuSmaller extends StatefulWidget {
  final int? projectId;
  final String? projectName;
  final List<Project> projects;
  final Function(String)? onSelected;

  const SelectProjectPopupMenuSmaller({
    super.key,
    this.projectId,
    this.projectName,
    required this.projects,
    this.onSelected,
  });

  @override
  State<SelectProjectPopupMenuSmaller> createState() =>
      _SelectProjectPopupMenuSmallerState();
}

class _SelectProjectPopupMenuSmallerState
    extends State<SelectProjectPopupMenuSmaller> {
  final double _selectListHeight = 56.0 * 3;
  final ScrollController _scrollController = ScrollController();

  final ValueNotifier<bool> _isMenuOpen = ValueNotifier<bool>(false);

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<String>(
      constraints: BoxConstraints(
        maxWidth: MediaQuery.of(context).size.width * 1 - 32,
      ),
      color: Colors.white,
      onSelected: (value) {
        widget.onSelected?.call(value);
        _isMenuOpen.value = false;
      },
      onOpened:
          () => setState(() {
            _isMenuOpen.value = true;
          }),
      onCanceled:
          () => setState(() {
            _isMenuOpen.value = false;
          }),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12.0),
        side: BorderSide(color: ColorPalette.neutral300, width: 1.0),
      ),
      offset: Offset(0.0, 8.0),
      clipBehavior: Clip.hardEdge,
      position: PopupMenuPosition.under,
      menuPadding: EdgeInsets.zero,
      itemBuilder:
          (BuildContext context) => [
            PopupMenuItem(
              enabled: false,
              padding: EdgeInsets.symmetric(vertical: 8.0),
              child: SizedBox(
                height: widget.projects.length > 3 ? _selectListHeight : null,
                child: Scrollbar(
                  controller: _scrollController,
                  thumbVisibility: true,
                  child: SingleChildScrollView(
                    controller: _scrollController,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        PopupMenuItem(
                          value: 'null',
                          padding: EdgeInsets.symmetric(horizontal: 8.0),
                          child: SleekPopupMenuItem(
                            'No project',
                            isSelected: widget.projectId == null,
                            showIcon: true,
                            noneVariant: true,
                          ),
                        ),
                        ...widget.projects.map((project) {
                          return PopupMenuItem(
                            value: project.id.toString(),
                            padding: EdgeInsets.symmetric(horizontal: 8.0),
                            child: SleekPopupMenuItem(
                              project.name,
                              isSelected: widget.projectId == project.id,
                              showIcon: true,
                            ),
                          );
                        }),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            PopupMenuItem(
              padding: EdgeInsets.zero,
              value: 'New',
              child: Container(
                width: MediaQuery.of(context).size.width,
                height: 48.0,
                decoration: BoxDecoration(
                  color: ColorPalette.neutral100,
                  borderRadius: const BorderRadius.only(
                    bottomLeft: Radius.circular(12.0),
                    bottomRight: Radius.circular(12.0),
                  ),
                  border: Border.all(
                    color: ColorPalette.neutral300,
                    width: 1.0,
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.only(left: 12.0),
                  child: Row(
                    children: [
                      IconSvg(
                        IconsLibrary.add_linear,
                        color: ColorPalette.neutral800,
                        size: 20,
                      ),
                      const SizedBox(width: 8.0),
                      Text('Create new project'),
                    ],
                  ),
                ),
              ),
            ),
          ],
      child: Container(
        padding: EdgeInsets.symmetric(vertical: 6.0, horizontal: 12.0),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(
            color:
                _isMenuOpen.value
                    ? ColorPalette.violet500
                    : ColorPalette.neutral300,
          ),
          borderRadius: BorderRadius.circular(12.0),
          boxShadow:
              _isMenuOpen.value
                  ? [
                    BoxShadow(
                      color: ColorPalette.violet300,
                      blurRadius: 4.0,
                      offset: Offset(0, 0),
                      // blurStyle: BlurStyle.outer,
                    ),
                  ]
                  : [],
        ),
        child: Row(
          children: [
            if (widget.projectId != null)
              IconSvg(IllustrationsLibrary.folderPurple, size: 16.0)
            else
              IconSvg(IllustrationsLibrary.folderGrey, size: 16.0),
            const SizedBox(width: 8.0),
            Text(
              widget.projectName ?? 'No project assigned',
              style: TextStyle(
                color:
                    widget.projectId == null
                        ? ColorPalette.neutral500
                        : ColorPalette.neutral800,
              ),
            ),
            const Spacer(),
          ],
        ),
      ),
    );
  }
}
