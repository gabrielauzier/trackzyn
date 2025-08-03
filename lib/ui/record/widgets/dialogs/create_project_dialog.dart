import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:trackzyn/ui/record/record_cubit.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/shared/sleek_label.dart';

class CreateProjectDialog extends StatefulWidget {
  const CreateProjectDialog({super.key});

  @override
  State<CreateProjectDialog> createState() => _CreateProjectDialogState();
}

class _CreateProjectDialogState extends State<CreateProjectDialog> {
  late final viewModel = Provider.of<RecordCubit>(context, listen: false);

  final TextEditingController _projectNameController = TextEditingController();

  void createProject() {
    Future.microtask(() async {
      viewModel.addProject(_projectNameController.text);
    });
    Navigator.of(context).pop(); // Close the dialog after creation
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      // backgroundColor: ColorPalette.neutral700.withValues(alpha: 0.25),
      title: const Text('Create new project'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SleekLabel(text: 'Project name'),
          TextField(
            controller: _projectNameController,
            decoration: const InputDecoration(
              hintText: 'My New Project',
              hintStyle: TextStyle(color: ColorPalette.neutral500),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.all(Radius.circular(12.0)),
                borderSide: BorderSide(color: ColorPalette.neutral300),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.all(Radius.circular(12.0)),
                borderSide: BorderSide(color: ColorPalette.neutral300),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.all(Radius.circular(12.0)),
                borderSide: BorderSide(color: ColorPalette.neutral300),
              ),
            ),
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
              if (_projectNameController.text.isNotEmpty) {
                createProject();
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
