import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'package:trackzyn/ui/record/record_cubit.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';
import 'package:trackzyn/ui/resources/extensions_icons_library.dart';
import 'package:trackzyn/ui/resources/illustrations_library.dart';
import 'package:trackzyn/ui/shared/icon_svg.dart';
import 'package:trackzyn/ui/shared/sleek_bottom_sheet.dart';

enum FileExtension {
  csv('.csv'),
  doc('.doc'),
  json('.json'),
  pdf('.pdf'),
  txt('.txt'),
  xml('.xml');

  final String extStr;

  const FileExtension(this.extStr);
}

class ExportReportSheet extends StatefulWidget {
  final List<FileExtension> allowedExtensions;

  const ExportReportSheet({
    super.key,
    this.allowedExtensions = const [
      FileExtension.csv,
      FileExtension.json,
      // FileExtension.txt,
    ],
  });

  @override
  State<ExportReportSheet> createState() => _ExportReportSheetState();
}

class _ExportReportSheetState extends State<ExportReportSheet> {
  late final viewModel = Provider.of<RecordCubit>(context, listen: false);

  FileExtension? _extensionSelected;
  bool _success = false;
  String _filePath = '';

  Widget _getExtensionIcon(FileExtension ext) {
    final iconSize = 48.0;
    switch (ext) {
      case FileExtension.csv:
        return IconSvg(ExtensionsIconsLibrary.csv, size: iconSize);
      case FileExtension.doc:
        return IconSvg(ExtensionsIconsLibrary.doc, size: iconSize);
      case FileExtension.json:
        return IconSvg(ExtensionsIconsLibrary.json, size: iconSize);
      case FileExtension.pdf:
        return IconSvg(ExtensionsIconsLibrary.pdf, size: iconSize);
      case FileExtension.txt:
        return IconSvg(ExtensionsIconsLibrary.txt, size: iconSize);
      case FileExtension.xml:
        return IconSvg(ExtensionsIconsLibrary.xml, size: iconSize);
    }
  }

  void handleExportTapped() {
    if (_extensionSelected == null) {
      debugPrint('No file extension selected for export.');
      return;
    }

    Future.microtask(() async {
      final filePath = await viewModel.exportActivities(_extensionSelected!);

      if (filePath != null) {
        setState(() {
          _success = true;
          _filePath = filePath;
        });
      } else {
        setState(() {
          _success = false;
        });
      }
    });
  }

  void handleViewInStorage() {
    viewModel.openDownloadFolder();
  }

  _buildExportContent() {
    return [
      Center(
        child: Text(
          'Export reports to',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: ColorPalette.neutral900,
          ),
        ),
      ),
      SizedBox(height: 24),
      Wrap(
        spacing: 12.0,
        runSpacing: 12.0,
        alignment: WrapAlignment.center,
        children: [
          for (var ext in widget.allowedExtensions)
            GestureDetector(
              onTap: () {
                setState(() {
                  if (_extensionSelected == ext) {
                    _extensionSelected = null;
                    return;
                  }
                  _extensionSelected = ext;
                });
              },
              child: Container(
                padding: EdgeInsets.symmetric(vertical: 24, horizontal: 64),
                decoration: BoxDecoration(
                  color:
                      _extensionSelected == ext
                          ? ColorPalette.violet50
                          : Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color:
                        _extensionSelected == ext
                            ? ColorPalette.violet500
                            : ColorPalette.neutral200,
                    width: 1,
                  ),
                ),
                child: Column(
                  children: [
                    _getExtensionIcon(ext),
                    const SizedBox(height: 8),
                    Text(
                      ext.extStr.toLowerCase(),
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color:
                            _extensionSelected == ext
                                ? ColorPalette.violet500
                                : ColorPalette.neutral900,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
      const SizedBox(height: 48.0),
      SizedBox(
        width: MediaQuery.of(context).size.width,
        child: ElevatedButton(
          style: ElevatedButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 12.0),
            backgroundColor: Colors.black,
            foregroundColor: Colors.white,
          ),
          onPressed:
              _extensionSelected == null
                  ? null
                  : () {
                    // Handle export logic here
                    handleExportTapped();
                  },
          child: const Text(
            'Export',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          ),
        ),
      ),
    ];
  }

  _buildExportSuccess() {
    final fileName = _filePath.split('/').last;

    return [
      const SizedBox(height: 24),
      IconSvg(IllustrationsLibrary.success, size: 128),
      const SizedBox(height: 24),
      Text(
        'Export successful!',
        style: TextStyle(
          fontSize: 24,
          fontWeight: FontWeight.bold,
          color: ColorPalette.neutral900,
        ),
      ),
      const SizedBox(height: 12),
      Text(
        'The total used time document has\n been successfully exported, now you\n can check it in your storage.',
        style: TextStyle(fontSize: 14, color: ColorPalette.neutral700),
        textAlign: TextAlign.center,
      ),
      const SizedBox(height: 24),
      Text(
        fileName,
        style: TextStyle(fontSize: 12, color: ColorPalette.neutral500),
        textAlign: TextAlign.center,
      ),
      const SizedBox(height: 36),
      SizedBox(
        width: MediaQuery.of(context).size.width,
        child: ElevatedButton(
          style: ElevatedButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 12.0),
            backgroundColor: Colors.black,
            foregroundColor: Colors.white,
          ),
          onPressed: () {
            handleViewInStorage();
          },
          child: const Text(
            'View in the storage',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          ),
        ),
      ),
      const SizedBox(height: 12),
      SizedBox(
        width: MediaQuery.of(context).size.width,
        child: OutlinedButton(
          style: ElevatedButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 12.0),
            backgroundColor: Colors.white,
            foregroundColor: Colors.black,
          ),
          onPressed: () {
            Navigator.of(context).pop();
          },
          child: const Text(
            'Back to home',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          ),
        ),
      ),
    ];
  }

  @override
  void initState() {
    super.initState();
  }

  @override
  Widget build(BuildContext context) {
    return SleekBottomSheet(
      children: switch (_success) {
        false => _buildExportContent(),
        true => _buildExportSuccess(),
      },
    );
  }
}
