class TaskPriority {
  static const String low = 'low';
  static const String medium = 'medium';
  static const String high = 'high';

  static String presenter(String priority) {
    switch (priority) {
      case TaskPriority.low:
        return 'Low';
      case TaskPriority.medium:
        return 'Medium';
      case TaskPriority.high:
        return 'High';
      default:
        return 'Unknown';
    }
  }
}
