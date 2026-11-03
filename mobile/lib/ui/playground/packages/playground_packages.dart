import 'package:flutter/material.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/resources/icons_library.dart';
import 'package:trackzyn/ui/shared/icon_svg.dart';
import 'dart:math';

class PlaygroundPackages extends StatefulWidget {
  const PlaygroundPackages({super.key});

  @override
  State<PlaygroundPackages> createState() => _PlaygroundPackagesState();
}

class _PlaygroundPackagesState extends State<PlaygroundPackages> {
  final double _leftContainerWidthFactor = 0.20;
  final double _centerContainerWidthFactor = 0.60;
  final double _rightContainerWidthFactor = 0.16;

  _boxDecoration({Color? backgroundColor = Colors.white}) {
    return BoxDecoration(
      color: backgroundColor,
      border: Border.all(color: Colors.black, width: 1),
      boxShadow: [
        BoxShadow(
          color: ColorPalette.neutral100.withValues(alpha: 0.5),
          blurRadius: 10,
          offset: const Offset(0, 2),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Playground Packages')),
      body: Center(
        child: ListView(
          children: [
            _buildListItem([
              _buildPackageItem(color: ColorPalette.violet50),
              _buildPackageItem(color: ColorPalette.violet100),
              _buildPackageItem(color: ColorPalette.violet200),
              _buildPackageItem(color: ColorPalette.violet300),
              _buildPackageItem(color: ColorPalette.violet400),
              _buildPackageItem(color: ColorPalette.violet500),
              _buildPackageItem(color: ColorPalette.violet600),
              _buildPackageItem(color: ColorPalette.violet700),
              _buildPackageItem(color: ColorPalette.violet800),
              _buildPackageItem(color: ColorPalette.violet900),
            ]),
            const SizedBox(height: 16),
            _buildListItem([
              _buildPackageItem(color: ColorPalette.amber50),
              _buildPackageItem(color: ColorPalette.amber100),
              _buildPackageItem(color: ColorPalette.amber200),
              _buildPackageItem(color: ColorPalette.amber300),
              _buildPackageItem(color: ColorPalette.amber400),
              _buildPackageItem(color: ColorPalette.amber500),
              _buildPackageItem(color: ColorPalette.amber600),
              _buildPackageItem(color: ColorPalette.amber700),
            ]),
            const SizedBox(height: 16),
            _buildListItem([
              _buildPackageItem(color: ColorPalette.red50),
              _buildPackageItem(color: ColorPalette.red100),
              _buildPackageItem(color: ColorPalette.red200),
              _buildPackageItem(color: ColorPalette.red300),
              _buildPackageItem(color: ColorPalette.red400),
              _buildPackageItem(color: ColorPalette.red500),
              _buildPackageItem(color: ColorPalette.red600),
            ]),
            const SizedBox(height: 16),
            _buildListItem([
              _buildPackageItem(color: ColorPalette.blue50),
              _buildPackageItem(color: ColorPalette.blue100),
              _buildPackageItem(color: ColorPalette.blue200),
              _buildPackageItem(color: ColorPalette.blue300),
              _buildPackageItem(color: ColorPalette.blue400),
              _buildPackageItem(color: ColorPalette.blue500),
            ]),
          ],
        ),
      ),
    );
  }

  Container _buildListItem(List<Widget> items) {
    return Container(
      alignment: Alignment.center,
      decoration: BoxDecoration(color: ColorPalette.stone200),
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: IntrinsicHeight(
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          crossAxisAlignment:
              CrossAxisAlignment
                  .stretch, // Ensure children stretch to fill the height
          children: [
            _buildLeftContainer(),
            // SizedBox(width: 2),
            _buildCenterContainer(items),
            // SizedBox(width: 2),
            _buildRightContainer(),
          ],
        ),
      ),
    );
  }

  Container _buildLeftContainer() {
    return Container(
      alignment: Alignment.center,
      decoration: _boxDecoration(backgroundColor: ColorPalette.emerald500),
      width: MediaQuery.of(context).size.width * _leftContainerWidthFactor,
      child: Text('LEFT', style: TextStyle(color: Colors.white)),
    );
  }

  Container _buildCenterContainer(List<Widget> items) {
    return Container(
      decoration: _boxDecoration(),
      // padding: EdgeInsets.symmetric(vertical: 12),
      alignment: Alignment.center,
      width: MediaQuery.of(context).size.width * _centerContainerWidthFactor,
      child: Wrap(
        spacing: 0, // Horizontal spacing
        runSpacing: 8, // Vertical spacing
        children: items,
      ),
    );
  }

  Container _buildRightContainer() {
    return Container(
      alignment: Alignment.center,
      decoration: _boxDecoration(backgroundColor: ColorPalette.sky500),
      width: MediaQuery.of(context).size.width * _rightContainerWidthFactor,
      child: Text('RIGHT', style: TextStyle(color: Colors.white)),
    );
  }

  FractionallySizedBox _buildPackageItem({
    Color? color = ColorPalette.violet100,
  }) {
    var words = [];

    final tam =
        Random().nextInt(5) + 1; // Random number of words between 1 and 5

    for (var i = 0; i < tam; i++) {
      words.add('Center');
    }

    return FractionallySizedBox(
      widthFactor: 0.5, // Occupy 50% of the parent's width
      child: Container(
        decoration: BoxDecoration(
          color: color,
          border: Border.all(color: Colors.black, width: 1),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.1),
              blurRadius: 4,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          children: [
            IconSvg(IconsLibrary.record_bulk, size: 24, color: Colors.white),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    words.join(' '),
                    style: TextStyle(color: Colors.white),
                    overflow: TextOverflow.visible,
                  ),
                  Text(
                    'Package Qtd',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      overflow: TextOverflow.visible,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
