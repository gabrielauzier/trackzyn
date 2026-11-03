getTimeByDate(DateTime? date) {
  if (date == null) return '--:--';

  String twoDigits(int n) => n.toString().padLeft(2, '0');
  final hours = twoDigits(date.hour);
  final minutes = twoDigits(date.minute);

  return '$hours:$minutes';
}
