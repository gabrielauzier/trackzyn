import 'package:flutter/material.dart';
import 'package:flutter_svg/svg.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';

class IconSvg extends StatelessWidget {
  const IconSvg(
    this.iconPath, {
    super.key,
    this.size = 24,
    this.color = ColorPalette.neutral900,
  });

  final String iconPath;
  final double? size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return SvgPicture.asset(
      iconPath,
      width: size,
      height: size,
      colorFilter: ColorFilter.mode(color, BlendMode.srcIn),
    );
  }
}
