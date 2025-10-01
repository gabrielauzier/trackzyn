import 'package:flutter/material.dart';
import 'package:trackzyn/domain/enums/task_priority.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/resources/icons_library.dart';
import 'package:trackzyn/ui/shared/icon_svg.dart';
import 'package:trackzyn/ui/shared/sleek_popup_menu_item.dart';

class SelectPriorityPopupMenu extends StatefulWidget {
  final String status;
  final Function(String)? onSelected;
  final List<String> priorities;

  const SelectPriorityPopupMenu({
    super.key,
    required this.status,
    this.priorities = const [
      TaskPriority.low,
      TaskPriority.medium,
      TaskPriority.high,
    ],
    this.onSelected,
  });

  @override
  State<SelectPriorityPopupMenu> createState() =>
      _SelectPriorityPopupMenuState();
}

class _SelectPriorityPopupMenuState extends State<SelectPriorityPopupMenu> {
  final ScrollController _scrollController = ScrollController();
  final ValueNotifier<bool> _isMenuOpen = ValueNotifier<bool>(false);

  // States
  late String _currentStatus;

  _getBackgroundColor(String status) {
    return switch (status) {
      TaskPriority.low => ColorPalette.green100,
      TaskPriority.medium => ColorPalette.amber100,
      TaskPriority.high => ColorPalette.red100,
      _ => ColorPalette.neutral100,
    };
  }

  _getForegroundColor(String status) {
    return switch (status) {
      TaskPriority.low => ColorPalette.green600,
      TaskPriority.medium => ColorPalette.amber600,
      TaskPriority.high => ColorPalette.red600,
      _ => ColorPalette.neutral600,
    };
  }

  _getBorderColor(String status) {
    return switch (status) {
      TaskPriority.low => ColorPalette.green200,
      TaskPriority.medium => ColorPalette.amber200,
      TaskPriority.high => ColorPalette.red200,
      _ => ColorPalette.neutral500,
    };
  }

  _buildCustomIcon(String status) {
    return Container(
      width: 16.0,
      height: 16.0,
      decoration: BoxDecoration(
        border: Border.all(
          color: switch (status) {
            TaskPriority.low => ColorPalette.green500,
            TaskPriority.medium => ColorPalette.amber500,
            TaskPriority.high => ColorPalette.red600,
            _ => ColorPalette.neutral500,
          },
          width: 1.0,
        ),
        shape: BoxShape.circle,
      ),
      child: Container(
        margin: EdgeInsets.all(2.0),
        decoration: BoxDecoration(
          color: switch (status) {
            TaskPriority.low => ColorPalette.green500,
            TaskPriority.medium => ColorPalette.amber500,
            TaskPriority.high => ColorPalette.red600,
            _ => ColorPalette.neutral500,
          },
          shape: BoxShape.circle,
        ),
      ),
    );
  }

  @override
  void initState() {
    super.initState();

    setState(() {
      _currentStatus = widget.status;
    });
  }

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

        setState(() {
          _currentStatus = value;
        });
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
                child: Scrollbar(
                  controller: _scrollController,
                  thumbVisibility: true,
                  child: SingleChildScrollView(
                    controller: _scrollController,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        ...widget.priorities.map((status) {
                          return PopupMenuItem(
                            value: status,
                            padding: EdgeInsets.symmetric(horizontal: 8.0),
                            child: SleekPopupMenuItem(
                              TaskPriority.presenter(status),
                              isSelected: status == _currentStatus,
                              showIcon: true,
                              customIcon: _buildCustomIcon(status),
                            ),
                          );
                        }),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
      child: Container(
        padding: EdgeInsets.symmetric(vertical: 6.0, horizontal: 12.0),
        decoration: BoxDecoration(
          color: _getBackgroundColor(_currentStatus),
          border: Border.all(
            color:
                _isMenuOpen.value
                    ? ColorPalette.violet500
                    : _getBorderColor(_currentStatus),
          ),
          borderRadius: BorderRadius.circular(99.0),
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
            IconSvg(
              IconsLibrary.flag_bold,
              size: 16.0,
              color: _getForegroundColor(_currentStatus),
            ),
            const SizedBox(width: 8.0),
            Text(
              TaskPriority.presenter(_currentStatus),
              style: TextStyle(
                color: _getForegroundColor(_currentStatus),
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
