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
      toolbarHeight: 56,
    ),
    cardColor: Colors.white,
    cardTheme: CardThemeData(
      color: backgroundColor,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      elevation: 1,
    ),
    textTheme: baseTheme.textTheme.apply(
      bodyColor: ColorPalette.neutral800,
      displayColor: ColorPalette.neutral800,
    ),
    tabBarTheme: TabBarThemeData(
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
    // menuTheme: MenuThemeData(
    //   style: MenuStyle(
    //     padding: WidgetStateProperty.all<EdgeInsets>(EdgeInsets.zero),
    //     backgroundColor: WidgetStateProperty.all<Color>(Colors.white),
    //     shadowColor: WidgetStateProperty.all<Color>(
    //       ColorPalette.neutral900.withValues(alpha: 0.1),
    //     ),
    //     surfaceTintColor: WidgetStateProperty.all<Color>(Colors.white),
    //     shape: WidgetStateProperty.all<OutlinedBorder>(
    //       RoundedRectangleBorder(borderRadius: BorderRadius.circular(8.0)),
    //     ),
    //     mouseCursor: WidgetStateProperty.all<MouseCursor>(
    //       SystemMouseCursors.click,
    //     ),
    //   ),
    // ),
    // menuButtonTheme: MenuButtonThemeData(
    //   style: ButtonStyle(
    //     padding: WidgetStateProperty.all<EdgeInsets>(EdgeInsets.zero),
    //     backgroundColor: WidgetStateProperty.all<Color>(Colors.white),
    //     shadowColor: WidgetStateProperty.all<Color>(
    //       ColorPalette.neutral900.withValues(alpha: 0.1),
    //     ),
    //     surfaceTintColor: WidgetStateProperty.all<Color>(Colors.white),
    //     shape: WidgetStateProperty.all<OutlinedBorder>(
    //       RoundedRectangleBorder(borderRadius: BorderRadius.circular(8.0)),
    //     ),
    //     mouseCursor: WidgetStateProperty.all<MouseCursor>(
    //       SystemMouseCursors.click,
    //     ),
    //   ),
    // ),
    dropdownMenuTheme: DropdownMenuThemeData(
      inputDecorationTheme: InputDecorationTheme(
        isDense: true,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(4)),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      ),
      menuStyle: MenuStyle(
        shape: WidgetStateProperty.all(
          RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12.0)),
      titleTextStyle: baseTheme.textTheme.titleLarge?.copyWith(
        color: ColorPalette.neutral900,
        fontSize: 20,
        fontWeight: FontWeight.w600,
      ),
      contentTextStyle: baseTheme.textTheme.bodyMedium?.copyWith(
        color: ColorPalette.neutral800,
      ),
      insetPadding: EdgeInsets.zero,
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(
        backgroundColor: Colors.transparent,
        padding: EdgeInsets.all(0),
        maximumSize: const Size(40, 40),
        splashFactory: NoSplash.splashFactory,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    ),
    scaffoldBackgroundColor: backgroundColor,
  );
}
