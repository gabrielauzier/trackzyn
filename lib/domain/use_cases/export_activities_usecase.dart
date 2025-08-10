import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';

import 'package:trackzyn/data/services/csv_service.dart';
import 'package:trackzyn/domain/models/activity.dart';
import 'package:trackzyn/ui/record/widgets/sheets/export_report_sheet.dart';

class ExportActivitiesUseCase {
  final CsvService _csvService;

  ExportActivitiesUseCase(CsvService csvService) : _csvService = csvService;

  Future<String?> execute(List<Activity> activities, FileExtension ext) async {
    try {
      final downloadsDirectory = await getDownloadsDirectory();
      if (downloadsDirectory == null) {
        throw Exception('Unable to access the downloads directory');
      }

      final now = DateTime.now().toIso8601String();

      final downloadPath =
          '${downloadsDirectory.path}/activities_export_$now.csv';

      var result;

      switch (ext) {
        case FileExtension.csv:
          // CSV is the default format, no need to change the file extension
          result = await _csvService.createCsv(
            filePath: downloadPath,
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
          // Handle JSON export if needed
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

      return result;
    } catch (e) {
      debugPrint('Erro ao buscar exportar: $e');

      return null;
    }
  }

  Future<void> open(String filePath) async {
    try {
      _csvService.openPath(filePath);
    } catch (e) {
      debugPrint('Erro ao abrir o arquivo: $e');
    }
  }
}
