import 'package:flutter/material.dart';
import 'package:trackzyn/ui/shared/styles/shared_activity_card_box_decoration.dart';

class PlaygroundPackageItem extends StatefulWidget {
  const PlaygroundPackageItem({super.key});

  @override
  State<PlaygroundPackageItem> createState() => _PlaygroundPackageItemState();
}

class _PlaygroundPackageItemState extends State<PlaygroundPackageItem> {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: MediaQuery.of(context).size.width * 0.5,
      height: 100,
      margin: EdgeInsets.all(8),
      decoration: sharedActivityCardBoxDecoration(),
      child: Center(child: Text('Item')),
    );
  }
}
