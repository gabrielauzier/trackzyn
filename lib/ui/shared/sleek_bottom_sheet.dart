import 'package:flutter/material.dart';

class SleekBottomSheet extends StatefulWidget {
  final double? height;
  final List<Widget>? children;
  final List<Widget>? bottom;

  const SleekBottomSheet({super.key, this.height, this.children, this.bottom});

  @override
  State<SleekBottomSheet> createState() => _SleekBottomSheetState();
}

class _SleekBottomSheetState extends State<SleekBottomSheet> {
  @override
  Widget build(BuildContext context) {
    return Container(
      height: widget.height,
      width: MediaQuery.of(context).size.width,
      padding: const EdgeInsets.only(
        left: 16.0,
        right: 16.0,
        top: 16.0,
        bottom: 64.0,
      ),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(16.0),
          topRight: Radius.circular(16.0),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.1),
            blurRadius: 10,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: Stack(
        children: [
          ListView(
            primary: false,
            shrinkWrap: true,
            physics: const ClampingScrollPhysics(),
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Container(
                    width: MediaQuery.of(context).size.width * 0.2,
                    height: 4,
                    margin: const EdgeInsets.only(bottom: 16.0),
                    decoration: BoxDecoration(
                      color: Colors.grey[300],
                      borderRadius: BorderRadius.circular(2.0),
                    ),
                  ),
                ],
              ),

              // Your bottom sheet content comes here
              ...(widget.children ?? []),

              if (widget.bottom != null)
                SizedBox(height: MediaQuery.of(context).size.height * 0.1),
            ],
          ),
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: Container(
              decoration: BoxDecoration(color: Colors.white),
              padding: const EdgeInsets.only(top: 8.0),
              child: Column(spacing: 12.0, children: widget.bottom ?? []),
            ),
          ),
        ],
      ),
    );
  }
}
