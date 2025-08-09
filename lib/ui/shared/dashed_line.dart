import 'package:flutter/material.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';

class DashedLine extends StatelessWidget {
  const DashedLine({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      child: LayoutBuilder(
        builder: (BuildContext context, BoxConstraints constraints) {
          return Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: List.generate(
              (constraints.maxWidth / 10).floor(),
              (index) => const SizedBox(
                width: 5,
                child: Divider(color: ColorPalette.neutral300, thickness: 1),
              ),
            ),
          );
        },
      ),
    );
  }
}

buildDashedLine() {
  return Container(
    margin: const EdgeInsets.symmetric(vertical: 8),
    child: LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        return Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: List.generate(
            (constraints.maxWidth / 10).floor(),
            (index) => const SizedBox(
              width: 5,
              child: Divider(color: ColorPalette.neutral300, thickness: 1),
            ),
          ),
        );
      },
    ),
  );
}
