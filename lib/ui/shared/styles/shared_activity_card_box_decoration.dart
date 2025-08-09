import 'package:flutter/material.dart';

import 'package:trackzyn/ui/resources/color_palette.dart';

BoxDecoration sharedActivityCardBoxDecoration() {
  return BoxDecoration(
    color: Colors.white,
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
