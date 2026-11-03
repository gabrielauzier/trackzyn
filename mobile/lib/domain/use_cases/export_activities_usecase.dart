import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';

import 'package:trackzyn/data/services/csv_service.dart';
import 'package:trackzyn/domain/models/activity.dart';
import 'package:trackzyn/ui/record/widgets/sheets/export_report_sheet.dart';
import 'package:downloadsfolder/downloadsfolder.dart';

class ExportActivitiesUseCase {
  final CsvService _csvService;

  ExportActivitiesUseCase(CsvService csvService) : _csvService = csvService;

  Future<String?> execute(List<Activity> activities, FileExtension ext) async {
    try {
      final downloadsDirectory = await getApplicationDocumentsDirectory();

      final now = DateTime.now()
          .toIso8601String()
          .split('.')
          .first
          // .replaceAll('-', ' ')
          .replaceAll(':', '-');

      final fileName = 'Activities Report $now${ext.extStr}';

      final filePath = join(downloadsDirectory.absolute.path, fileName);

      late final String? result;

      switch (ext) {
        case FileExtension.csv:
          result = await _csvService.createCsv(
            filePath: filePath,
            data: [
              [
                'Activity ID',
                'Task Name',
                'Project Name',
                'Started At',
                'Duration',
              ],
              ...activities.map((activity) {
                return [
                  activity.id,
                  activity.taskName ?? 'No Task',
                  activity.projectName ?? 'No Project',
                  activity.startedAt.toIso8601String(),
                  activity.timeStr,
                ];
              }),
            ],
          );
          break;
        case FileExtension.doc:
          // Handle DOC export if needed
          break;
        case FileExtension.json:
          result = await _csvService.createJson(
            filePath: filePath,
            data: activities.map((activity) => activity.toMap()).toList(),
          );
          break;
        case FileExtension.pdf:
          // Handle PDF export if needed
          break;
        case FileExtension.txt:
          // Handle TXT export if needed
          break;
        case FileExtension.xml:
          // Handle XML export if needed
          break;
      }

      // Copy file to device's Downloads folder
      bool? success = await copyFileIntoDownloadFolder(filePath, fileName);
      if (success == true) {
        debugPrint('File copied successfully.');
        // openDownloadFolder();
      } else {
        debugPrint('Failed to copy file.');
      }

      return result;
    } catch (e) {
      debugPrint('Erro ao buscar exportar: $e');

      return null;
    }
  }

  Future<void> open() async {
    try {
      openDownloadFolder();
    } catch (e) {
      debugPrint('Erro ao abrir o arquivo: $e');
    }
  }
}
