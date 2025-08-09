String getDateTruncate(DateTime? date) {
  final dateYYYYMMDD = date?.toIso8601String().split('T').first;

  if (dateYYYYMMDD == null) {
    return '';
  }

  return dateYYYYMMDD;
}
