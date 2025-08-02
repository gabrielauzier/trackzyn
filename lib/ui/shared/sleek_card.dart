import 'package:flutter/material.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';

class SleekCard extends StatelessWidget {
  final Widget child;
  final double? width;
  final double? height;

  const SleekCard({
    super.key,
    this.child = const SizedBox(),
    this.width,
    this.height,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          color: Theme.of(context).cardColor,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: ColorPalette.neutral200, width: 2),
        ),
        child: Padding(padding: const EdgeInsets.all(10.0), child: child),
      ),
    );
  }
}
