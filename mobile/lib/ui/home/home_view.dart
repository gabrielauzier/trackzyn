import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:trackzyn/ui/home/home_viewmodel.dart';

import 'package:trackzyn/ui/home/widgets/all_projects_container.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/shared/sleek_card.dart';
import 'package:trackzyn/ui/utils/get_full_date_str.dart';

class HomeView extends StatefulWidget {
  const HomeView({super.key});

  @override
  State<HomeView> createState() => _HomeViewState();
}

class _HomeViewState extends State<HomeView> {
  late final viewModel = Provider.of<HomeViewModel>(context, listen: false);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ColorPalette.neutral100,
      appBar: AppBar(
        backgroundColor: ColorPalette.neutral100,
        scrolledUnderElevation: 0.0,
        title: Column(
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                getFullDateStr(DateTime.now()),
                style: TextStyle(fontSize: 14, color: ColorPalette.neutral500),
              ),
            ),
            Align(
              alignment: Alignment.centerLeft,
              child: const Text(
                'Welcome to Trackzyn!',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      ),
      body: _buildContainerBackground(
        context,
        ListView(
          children: [
            AllProjectsContainer(),
            SleekCard(height: MediaQuery.of(context).size.height * 0.8),
          ],
        ),
      ),
    );
  }

  Container _buildContainerBackground(BuildContext context, Widget child) {
    return Container(
      width: MediaQuery.of(context).size.width,
      alignment: Alignment.topCenter,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            ColorPalette.neutral100,
            ColorPalette.violet300,
            ColorPalette.violet100,
          ],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: child,
    );
  }
}
