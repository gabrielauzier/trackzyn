String getTotalTimeStr(int totalSeconds, {bool showSeconds = true}) {
  final hours = (totalSeconds / 3600).floor();
  final minutes = ((totalSeconds % 3600) / 60).floor();
  final seconds = totalSeconds % 60;

  var totalTimeStr = '';
  if (hours > 0) {
    totalTimeStr += '${hours}h ';
  }
  if (minutes > 0) {
    totalTimeStr += '${minutes}m ';
  }
  if (showSeconds) {
    if (seconds > 0 || totalTimeStr.isEmpty) {
      totalTimeStr += '${seconds}s';
    }
  }

  return totalTimeStr.trim();
}
