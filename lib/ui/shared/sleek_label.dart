import 'package:flutter/material.dart';

class SleekLabel extends StatefulWidget {
  final String text;
  final int? count;

  const SleekLabel({super.key, required this.text, this.count});

  @override
  State<SleekLabel> createState() => _SleekLabelState();
}

class _SleekLabelState extends State<SleekLabel> {
  @override
  Widget build(BuildContext context) {
    return Container(
      alignment: Alignment.centerLeft,
      padding: const EdgeInsets.symmetric(vertical: 4.0),
      child: Row(
        children: [
          Text(
            widget.text,
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
          ),
          Text(
            widget.count != null ? ' (${widget.count})' : '',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }
}
