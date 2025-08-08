import 'dart:io';
import 'package:csv/csv.dart';

class CsvService {
  /// Generates a CSV file from the provided data and saves it to the given path.
  Future<void> createCsv({
    required String filePath,
    required List<List<dynamic>> data,
  }) async {
    try {
      final csvData = const ListToCsvConverter().convert(data);
      final file = File(filePath);
      await file.writeAsString(csvData);
      print('CSV file created at $filePath');
    } catch (e) {
      print('Error creating CSV file: $e');
    }
  }
}
