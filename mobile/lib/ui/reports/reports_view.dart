import 'package:flutter/material.dart';

class ReportsView extends StatefulWidget {
  const ReportsView({super.key});

  @override
  State<ReportsView> createState() => _ReportsViewState();
}

class _ReportsViewState extends State<ReportsView> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            const Text(
              'Reports',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
            ),
            // AppBar Buttons Here
          ],
        ),
      ),
      body: Center(child: Text('Reports will be displayed here.')),
    );
  }
}
