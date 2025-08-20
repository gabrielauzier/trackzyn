import 'package:flutter/material.dart';
import 'package:trackzyn/ui/agenda/agenda.dart';

import 'package:trackzyn/ui/record/record_view.dart';
import 'package:trackzyn/ui/reports/reports_view.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/resources/icons_library.dart';
import 'package:trackzyn/ui/shared/icon_svg.dart';

class AppNavigationBar extends StatefulWidget {
  const AppNavigationBar({super.key});

  @override
  State<AppNavigationBar> createState() => _AppNavigationBarState();
}

class _AppNavigationBarState extends State<AppNavigationBar> {
  int currentPageIndex = 1; // Default to RecordView

  final destinations = [
    NavigationDestinationCustomItem(
      icon: IconsLibrary.home_2_bold,
      label: 'Home',
      view: const Text('Home'),
    ),
    NavigationDestinationCustomItem(
      icon: IconsLibrary.calendar_2_bold,
      label: 'Agenda',
      view: const Agenda(),
    ),
    NavigationDestinationCustomItem(
      icon: IconsLibrary.record_circle_bold,
      label: 'Record',
      view: const RecordView(),
    ),
    NavigationDestinationCustomItem(
      icon: IconsLibrary.graph_bold,
      label: 'Reports',
      view: const ReportsView(),
    ),
    NavigationDestinationCustomItem(
      icon: IconsLibrary.user_bold,
      label: 'Settings',
      view: const Text('Settings'),
    ),
  ];

  List<Widget> _buildDestinations() {
    return destinations.map((destination) {
      return NavigationDestination(
        icon: IconSvg(
          destination.icon,
          color: ColorPalette.neutral400,
          size: 28,
        ),
        selectedIcon: IconSvg(
          destination.icon,
          color: ColorPalette.violet500,
          size: 28,
        ),
        label: destination.label,
      );
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      bottomNavigationBar: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: NavigationBarTheme(
          data: NavigationBarThemeData(
            indicatorColor: Colors.transparent,
            elevation: 0,
            indicatorShape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
            overlayColor: WidgetStateProperty.all(Colors.transparent),
            labelTextStyle: WidgetStateProperty.resolveWith<TextStyle>(
              (Set<WidgetState> states) =>
                  states.contains(WidgetState.selected)
                      ? const TextStyle(
                        color: ColorPalette.violet500,
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                      )
                      : const TextStyle(
                        color: ColorPalette.neutral400,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
            ),
          ),
          child: NavigationBar(
            selectedIndex: currentPageIndex,
            onDestinationSelected: (int index) {
              setState(() {
                currentPageIndex = index;
              });
            },
            destinations: _buildDestinations(),
            backgroundColor: Colors.transparent,
          ),
        ),
      ),
      body: destinations[currentPageIndex].view,
    );
  }
}

class NavigationDestinationCustomItem {
  final String icon;
  final String label;
  final Widget view;

  NavigationDestinationCustomItem({
    required this.icon,
    required this.label,
    this.view = const SizedBox(),
  });
}
