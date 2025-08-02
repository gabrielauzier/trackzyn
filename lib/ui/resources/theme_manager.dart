import 'package:flutter/material.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';

ThemeData buildTheme() {
  var baseTheme = ThemeData(
    colorScheme: ColorScheme.fromSeed(seedColor: ColorPalette.violet500),
    useMaterial3: true,
  );

  var backgroundColor = ColorPalette.neutral50;

  return baseTheme.copyWith(
    appBarTheme: AppBarTheme(
      backgroundColor: backgroundColor,
      elevation: 0,
      toolbarHeight: 0,
    ),
    cardColor: Colors.white,
    cardTheme: CardTheme(
      color: backgroundColor,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      elevation: 1,
    ),
    textTheme: baseTheme.textTheme.apply(
      bodyColor: ColorPalette.neutral800,
      displayColor: ColorPalette.neutral800,
    ),
    scaffoldBackgroundColor: backgroundColor,
  );
}
