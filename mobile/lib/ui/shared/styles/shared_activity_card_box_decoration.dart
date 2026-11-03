import 'package:flutter/material.dart';

import 'package:trackzyn/ui/resources/color_palette.dart';

BoxDecoration sharedActivityCardBoxDecoration({
  Color? backgroundColor = Colors.white,
}) {
  return BoxDecoration(
    color: backgroundColor,
    borderRadius: BorderRadius.circular(20),
    border: Border.all(color: ColorPalette.neutral200, width: 1),
    boxShadow: [
      BoxShadow(
        color: ColorPalette.neutral100.withValues(alpha: 0.5),
        blurRadius: 10,
        offset: const Offset(0, 2),
      ),
    ],
  );
}
