import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:trackzyn/ui/record/record_cubit.dart';
import 'package:trackzyn/ui/record/record_state.dart';
import 'package:trackzyn/ui/record/widgets/sheets/associate_working_on.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';

class WhatAreYouWorkingOn extends StatefulWidget {
  const WhatAreYouWorkingOn({super.key});

  @override
  State<WhatAreYouWorkingOn> createState() => _WhatAreYouWorkingOnState();
}

class _WhatAreYouWorkingOnState extends State<WhatAreYouWorkingOn> {
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        showModalBottomSheet(
          context: context,
          isScrollControlled: true,
          builder: (context) => const AssociateWorkingOn(),
        );
      },
      child: BlocBuilder<RecordCubit, RecordState>(
        builder: (context, state) {
          return Container(
            width: MediaQuery.of(context).size.width,
            decoration: BoxDecoration(
              color: switch (state.taskId == null) {
                false => ColorPalette.violet50,
                true => ColorPalette.stone100,
              },
              borderRadius: BorderRadius.circular(12),
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    state.projectName ?? 'No project assignee',
                    style: TextStyle(
                      fontSize: 16,
                      color: switch (state.taskId == null) {
                        false => ColorPalette.violet500,
                        true => ColorPalette.neutral500,
                      },
                    ),
                  ),
                  Text(
                    state.taskName ?? 'What are you working on?',
                    style: TextStyle(
                      fontSize: 18,
                      color: switch (state.taskId == null) {
                        false => ColorPalette.violet800,
                        true => ColorPalette.neutral800,
                      },
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
