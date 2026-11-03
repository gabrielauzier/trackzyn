import 'package:flutter/material.dart';

class TimeWheel extends StatefulWidget {
  final Function(int) onChanged;

  final int range;

  static void _defaultOnChanged(int value) {}

  const TimeWheel({
    super.key,
    this.onChanged = _defaultOnChanged,
    this.range = 10,
  });

  @override
  State<TimeWheel> createState() => _TimeWheelState();
}

class _TimeWheelState extends State<TimeWheel> {
  int? _selectedNumber = 0;

  final double _itemExtent = 50.0;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        SizedBox(
          height: _itemExtent * 3,
          child: ListWheelScrollView.useDelegate(
            itemExtent: _itemExtent,
            physics: FixedExtentScrollPhysics(),
            perspective: 0.00000000001,
            onSelectedItemChanged: (index) {
              setState(() {
                _selectedNumber = index % widget.range; // Ensure looping
              });
              widget.onChanged(_selectedNumber!);
            },
            childDelegate: ListWheelChildBuilderDelegate(
              builder: (context, index) {
                final displayIndex = index % widget.range; // Loop the numbers
                return Center(
                  child: AnimatedDefaultTextStyle(
                    duration: Duration(milliseconds: 200),
                    style: TextStyle(
                      fontSize: displayIndex == _selectedNumber ? 40 : 32,
                      fontWeight: FontWeight.bold,
                      color: Colors.black,
                    ),
                    child: Text(displayIndex.toString().padLeft(2, '0')),
                  ),
                );
              },
              childCount: null, // Infinite loop
            ),
          ),
        ),
        Positioned.fill(
          child: IgnorePointer(
            child: Center(
              child: Container(
                height: MediaQuery.of(context).size.height * 1,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.white.withValues(alpha: 0.97),
                      Colors.white.withValues(alpha: 0.7),
                      Colors.white.withValues(alpha: 0.0),
                      Colors.white.withValues(alpha: 0.7),
                      Colors.white.withValues(alpha: 0.95),
                    ],
                    // stops: [1.0, 0.5, 0.0],
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
