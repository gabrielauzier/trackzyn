import 'package:flutter/material.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/resources/icons_library.dart';
import 'package:trackzyn/ui/resources/illustrations_library.dart';
import 'package:trackzyn/ui/shared/icon_svg.dart';

class SleekPopupMenuItem extends StatelessWidget {
  final String text;
  final bool isSelected;
  final bool showIcon;
  final bool noneVariant;
  final Widget? customIcon;

  const SleekPopupMenuItem(
    this.text, {
    super.key,
    this.isSelected = false,
    this.showIcon = true,
    this.noneVariant = false,
    this.customIcon,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 12.0, vertical: 4.0),
      width: MediaQuery.of(context).size.width,
      height: 48.0,
      decoration: BoxDecoration(
        color: isSelected ? ColorPalette.neutral100 : Colors.transparent,
        borderRadius: BorderRadius.circular(8.0),
        border:
            isSelected
                ? Border.all(color: ColorPalette.neutral300, width: 1.0)
                : null,
      ),
      child: Row(
        children: [
          if (customIcon != null && showIcon) ...[
            customIcon!,
            const SizedBox(width: 8.0),
          ] else if (showIcon) ...[
            if (noneVariant)
              IconSvg(IllustrationsLibrary.folderGrey, size: 20.0)
            else
              IconSvg(IllustrationsLibrary.folderPurple, size: 20.0),
            const SizedBox(width: 8.0),
          ],
          Text(
            text,
            style: TextStyle(
              color:
                  noneVariant
                      ? ColorPalette.neutral500
                      : ColorPalette.neutral800,
            ),
          ),
          const Spacer(),
          if (isSelected)
            IconSvg(
              IconsLibrary.tick_circle_bold,
              color: ColorPalette.green600,
            ),
        ],
      ),
    );
  }
}
