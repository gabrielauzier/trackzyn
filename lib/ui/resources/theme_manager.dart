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
    tabBarTheme: TabBarTheme(
      labelColor: ColorPalette.violet500,
      labelStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
      unselectedLabelColor: ColorPalette.neutral500,
      unselectedLabelStyle: const TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w600,
      ),
      indicatorColor: ColorPalette.violet500,
      indicatorSize: TabBarIndicatorSize.tab,
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 0),
        backgroundColor: Colors.white,
        side: BorderSide(width: 1.0, color: ColorPalette.neutral300),
        foregroundColor: ColorPalette.neutral900,
        shadowColor: ColorPalette.neutral900.withValues(alpha: 0.1),
        overlayColor: Colors.black,
        elevation: 1,
      ),
    ),
    scaffoldBackgroundColor: backgroundColor,
  );
}
