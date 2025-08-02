import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'package:trackzyn/ui/record/record_cubit.dart';
import 'package:trackzyn/ui/record/widgets/record_card.dart';

class RecordView extends StatefulWidget {
  const RecordView({super.key});

  @override
  State<RecordView> createState() => _RecordViewState();
}

class _RecordViewState extends State<RecordView> {
  bool isStarted = true;

  final cubit = RecordCubit();

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) => cubit,
      child: Scaffold(
        body: SafeArea(
          child: Container(
            // width: MediaQuery.of(context).size.width,
            // height: MediaQuery.of(context).size.height,
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 10),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.start,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    IconButton(
                      icon: const Icon(Icons.arrow_back),
                      onPressed: () {
                        // Navigator.pop(context);
                      },
                    ),
                    const Text(
                      'Record',
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(width: 48), // Placeholder for alignment
                  ],
                ),
                const SizedBox(height: 20),
                Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.center,
                  mainAxisSize: MainAxisSize.max,
                  children: [RecordCard()],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
