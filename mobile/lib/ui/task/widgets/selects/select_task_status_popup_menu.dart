import 'package:flutter/material.dart';

import 'package:trackzyn/domain/enums/task_status.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/shared/sleek_popup_menu_item.dart';

class SelectTaskStatusPopupMenu extends StatefulWidget {
  final String status;
  final Function(String)? onSelected;
  final List<String> statuses;

  const SelectTaskStatusPopupMenu({
    super.key,
    required this.status,
    this.statuses = const [
      TaskStatus.notStarted,
      TaskStatus.inProgress,
      TaskStatus.inReview,
      TaskStatus.completed,
    ],
    this.onSelected,
  });

  @override
  State<SelectTaskStatusPopupMenu> createState() =>
      _SelectTaskStatusPopupMenuState();
}

class _SelectTaskStatusPopupMenuState extends State<SelectTaskStatusPopupMenu> {
  final ScrollController _scrollController = ScrollController();
  final ValueNotifier<bool> _isMenuOpen = ValueNotifier<bool>(false);

  // States
  late String _currentStatus;

  _buildCustomIcon(String status) {
    return Container(
      width: 16.0,
      height: 16.0,
      decoration: BoxDecoration(
        border: Border.all(
          color: switch (status) {
            TaskStatus.notStarted => ColorPalette.neutral400,
            TaskStatus.inProgress => ColorPalette.blue500,
            TaskStatus.inReview => ColorPalette.orange500,
            TaskStatus.completed => ColorPalette.green500,
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
            TaskStatus.notStarted => ColorPalette.neutral400,
            TaskStatus.inProgress => ColorPalette.blue500,
            TaskStatus.inReview => ColorPalette.orange500,
            TaskStatus.completed => ColorPalette.green500,
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
                        ...widget.statuses.map((status) {
                          return PopupMenuItem(
                            value: status,
                            padding: EdgeInsets.symmetric(horizontal: 8.0),
                            child: SleekPopupMenuItem(
                              TaskStatus.presenter(status),
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
            _buildCustomIcon(_currentStatus),
            const SizedBox(width: 8.0),
            Text(
              TaskStatus.presenter(_currentStatus),
              style: TextStyle(
                color: ColorPalette.neutral900,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
