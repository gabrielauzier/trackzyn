import 'package:flutter/material.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';

class SleekCard extends StatelessWidget {
  final Widget child;
  final double? width;
  final double? height;
  final EdgeInsets? padding;

  const SleekCard({
    super.key,
    this.child = const SizedBox(),
    this.width,
    this.height,
    this.padding,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      padding: padding,
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: ColorPalette.neutral200,
            blurRadius: 10,
            offset: const Offset(0, 2), // changes position of shadow
          ),
        ],
      ),
      child: Padding(padding: const EdgeInsets.all(10.0), child: child),
    );
  }
}
