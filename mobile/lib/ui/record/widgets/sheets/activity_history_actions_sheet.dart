import 'package:flutter/material.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/resources/icons_library.dart';
import 'package:trackzyn/ui/shared/icon_svg.dart';
import 'package:trackzyn/ui/shared/sleek_bottom_sheet.dart';
import 'package:trackzyn/ui/shared/styles/shared_activity_card_box_decoration.dart';

class ActivityHistoryActionsSheet extends StatefulWidget {
  const ActivityHistoryActionsSheet({super.key});

  @override
  State<ActivityHistoryActionsSheet> createState() =>
      _ActivityHistoryActionsSheetState();
}

class _ActivityHistoryActionsSheetState
    extends State<ActivityHistoryActionsSheet> {
  @override
  Widget build(BuildContext context) {
    return SleekBottomSheet(
      children: [
        Container(
          width: MediaQuery.of(context).size.width,
          decoration: sharedActivityCardBoxDecoration(),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,

            children: [
              ActionOption('Play again', actionIcon: IconsLibrary.play_linear),
              const Divider(height: 1, color: ColorPalette.neutral200),
              ActionOption(
                'Archive',
                actionIcon: IconsLibrary.Essential_archive_linear,
              ),
              const Divider(height: 1, color: ColorPalette.neutral200),
              ActionOption(
                'Delete',
                actionIcon: IconsLibrary.trash_linear,
                color: ColorPalette.red600,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class ActionOption extends StatelessWidget {
  const ActionOption(
    this.actionText, {
    super.key,
    required this.actionIcon,
    this.color = ColorPalette.neutral800,
  });

  final String actionText;
  final String actionIcon;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(2.0)),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          IconSvg(actionIcon, color: color, size: 20),
          const SizedBox(width: 8),
          Text(
            actionText,
            style: TextStyle(color: color, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }
}
