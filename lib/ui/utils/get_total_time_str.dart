String getTotalTimeStr(int totalSeconds) {
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
  if (seconds > 0 || totalTimeStr.isEmpty) {
    totalTimeStr += '${seconds}s';
  }
  return totalTimeStr.trim();
}
