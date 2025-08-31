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
    bottomNavigationBarTheme: BottomNavigationBarThemeData(
      backgroundColor: Colors.white,
      selectedItemColor: ColorPalette.violet500,
      unselectedItemColor: ColorPalette.neutral500,
      selectedLabelStyle: const TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w600,
      ),
      unselectedLabelStyle: const TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w600,
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.transparent,
      iconTheme: WidgetStateProperty.all(
        IconThemeData(color: ColorPalette.neutral500, size: 24),
      ),
      indicatorColor: Colors.transparent,
      labelTextStyle: WidgetStateProperty.all(
        const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: ColorPalette.neutral500,
        ),
      ),

      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      height: 80,
    ),
    navigationRailTheme: NavigationRailThemeData(
      backgroundColor: Colors.transparent,
      selectedIconTheme: IconThemeData(color: ColorPalette.violet500, size: 24),
      unselectedIconTheme: IconThemeData(
        color: ColorPalette.neutral500,
        size: 24,
      ),
      selectedLabelTextStyle: const TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w600,
      ),
    ),
    scaffoldBackgroundColor: backgroundColor,
    scrollbarTheme: ScrollbarThemeData(
      thumbVisibility: WidgetStateProperty.all<bool>(true),
      thumbColor: WidgetStateProperty.all<Color>(ColorPalette.neutral500),
      trackColor: WidgetStateProperty.all<Color>(ColorPalette.neutral200),
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8.0)),
      elevation: 1,
      textStyle: baseTheme.textTheme.bodyMedium?.copyWith(
        color: ColorPalette.neutral800,
      ),
      menuPadding: EdgeInsets.zero,
    ),
    timePickerTheme: TimePickerThemeData(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      backgroundColor: Colors.white,
      dialBackgroundColor: ColorPalette.neutral100,
      dialHandColor: ColorPalette.violet500.withValues(alpha: 0.7),
      dialTextColor: ColorPalette.neutral900,
      dialTextStyle: baseTheme.textTheme.bodyLarge?.copyWith(
        color: ColorPalette.neutral900,
        fontSize: 16,
        fontWeight: FontWeight.w500,
      ),
      dayPeriodTextColor: ColorPalette.neutral900,
      hourMinuteColor: ColorPalette.neutral100,
      hourMinuteTextColor: ColorPalette.neutral900,
      hourMinuteShape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12.0),
      ),
      cancelButtonStyle: TextButton.styleFrom(
        foregroundColor: ColorPalette.neutral500,
        textStyle: const TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w500,
          color: ColorPalette.neutral500,
        ),
      ),
      confirmButtonStyle: TextButton.styleFrom(
        foregroundColor: ColorPalette.violet500,
        textStyle: const TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w600,
          color: ColorPalette.neutral50,
        ),
      ),
      entryModeIconColor: ColorPalette.neutral900,
      timeSelectorSeparatorColor: WidgetStateProperty.all<Color>(
        ColorPalette.neutral900,
      ),
    ),
    datePickerTheme: DatePickerThemeData(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      backgroundColor: Colors.white,
      headerBackgroundColor: ColorPalette.neutral100,
      dayForegroundColor: WidgetStateProperty.resolveWith<Color>((
        Set<WidgetState> states,
      ) {
        if (states.contains(WidgetState.selected)) {
          return Colors.white;
        }
        if (states.contains(WidgetState.disabled)) {
          return ColorPalette.neutral300;
        }
        return ColorPalette.neutral800;
      }),
      dayBackgroundColor: WidgetStateProperty.resolveWith<Color>((
        Set<WidgetState> states,
      ) {
        if (states.contains(WidgetState.selected)) {
          return ColorPalette.violet500;
        }
        if (states.contains(WidgetState.pressed)) {
          return ColorPalette.violet500.withValues(alpha: 0.1);
        }
        return Colors.transparent;
      }),
      rangeSelectionBackgroundColor: ColorPalette.violet500.withValues(
        alpha: 0.1,
      ),
      rangeSelectionOverlayColor: WidgetStateProperty.all(
        ColorPalette.violet500.withValues(alpha: 0.2),
      ),
      todayBackgroundColor: WidgetStateProperty.resolveWith(
        (Set<WidgetState> states) =>
            states.contains(WidgetState.selected)
                ? ColorPalette.violet500
                : ColorPalette.violet100,
      ),
      todayForegroundColor: WidgetStateProperty.resolveWith(
        (Set<WidgetState> states) =>
            states.contains(WidgetState.selected)
                ? Colors.white
                : ColorPalette.violet500,
      ),
      inputDecorationTheme: InputDecorationTheme(
        isDense: true,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(4)),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 14,
          vertical: 10,
        ),
      ),
      cancelButtonStyle: TextButton.styleFrom(
        foregroundColor: ColorPalette.neutral500,
        textStyle: const TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w500,
          color: ColorPalette.neutral500,
        ),
      ),
      confirmButtonStyle: TextButton.styleFrom(
        foregroundColor: ColorPalette.violet500,
        textStyle: const TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w600,
          color: ColorPalette.neutral50,
        ),
      ),
    ),
  );
}
