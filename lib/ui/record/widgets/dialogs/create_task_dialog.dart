import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'package:trackzyn/ui/record/record_cubit.dart';
import 'package:trackzyn/ui/shared/sleek_input.dart';
import 'package:trackzyn/ui/shared/sleek_label.dart';

class CreateTaskDialog extends StatefulWidget {
  const CreateTaskDialog({super.key});

  @override
  State<CreateTaskDialog> createState() => _CreateTaskDialogState();
}

class _CreateTaskDialogState extends State<CreateTaskDialog> {
  late final viewModel = Provider.of<RecordCubit>(context, listen: false);

  final TextEditingController _taskNameController = TextEditingController();

  void createTask() {
    Future.microtask(() async {
      viewModel.addTask(_taskNameController.text);
    });
    Navigator.of(context).pop(); // Close the dialog after creation
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      // backgroundColor: ColorPalette.neutral700.withValues(alpha: 0.25),
      title: const Text('Create new task'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SleekLabel(text: 'Task name'),
          SleekInput(
            controller: _taskNameController,
            hintText: 'My New Task',
            autofocus: true,
          ),
        ],
      ),
      actions: [
        SizedBox(
          width: MediaQuery.of(context).size.width * 0.8,
          child: ElevatedButton(
            style: ElevatedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 12.0),
              backgroundColor: Colors.black,
              foregroundColor: Colors.white,
            ),
            onPressed: () {
              if (_taskNameController.text.isNotEmpty) {
                createTask();
              }
            },
            child: const Text(
              'Create',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
          ),
        ),
      ],
    );
  }
}
