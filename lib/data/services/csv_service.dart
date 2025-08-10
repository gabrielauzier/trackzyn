import 'dart:io';
import 'package:csv/csv.dart';
import 'package:flutter/material.dart';
import 'package:open_file/open_file.dart';
import 'package:path_provider/path_provider.dart';

class CsvService {
  /// Generates a CSV file from the provided data and saves it to the given path.
  Future<String?> createCsv({
    required String filePath,
    required List<List<dynamic>> data,
  }) async {
    try {
      final csvData = const ListToCsvConverter().convert(data);
      final file = File(filePath);
      await file.parent.create(recursive: true);
      await file.writeAsString(csvData);
      debugPrint('CSV file created at $filePath');
      return filePath;
    } catch (e) {
      debugPrint('Error creating CSV file: $e');
      return null;
    }
  }

  Future<void> openSpecificFile(String filePath) async {
    // final directory = await getApplicationDocumentsDirectory();
    // final filePath = '${directory.path}/my_document.pdf';
    await OpenFile.open(filePath);
  }

  Future<void> openDirectoryInExplorer(String folderDir) async {
    final directory = await getApplicationDocumentsDirectory();
    await OpenFile.open(directory.path); // Opens the directory
  }

  openPath(String path) {
    OpenFile.open(path);
  }

  void openDirectory(String path) {
    Process.run("explorer", [path], workingDirectory: path);
  }
}
